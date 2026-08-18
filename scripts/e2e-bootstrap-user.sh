#!/usr/bin/env bash
set -e

# Creates a standard user with project and namespace resources in the downstream cluster.
# Mirrors the Cypress 'createUser' command and sub-commands
#
# Resources created:
#   - A project in the downstream cluster
#   - A namespace within that project
#   - A new user
#   - Role binding: 'virtual cluster admin' on the project
#   - Role binding: 'view virtual cluster policies' in the downstream cluster
#   - Role binding: 'user' globally (standard user)

TEST_BASE_URL=${TEST_BASE_URL:-https://127.0.0.1.sslip.io}
CATTLE_BOOTSTRAP_PASSWORD=${CATTLE_BOOTSTRAP_PASSWORD:-password}
PROJECT_NAME=${PROJECT_NAME:-e2e-project}
NAMESPACE_NAME=${NAMESPACE_NAME:-e2e-namespace}
STANDARD_USER=${STANDARD_USER:-standard-user}
STANDARD_USER_PASSWORD=${STANDARD_USER_PASSWORD:-$CATTLE_BOOTSTRAP_PASSWORD}

# MGMT_CLUSTER_NAME is the management cluster's actual id (e.g. "c-m-xxxxxxxx"),
# set by e2e-import-generic-cluster.sh when the Norman cluster object is created
# (CLUSTER_NAME there) is not a valid id for the API calls below.
if [ -z "$MGMT_CLUSTER_NAME" ]; then
  echo "MGMT_CLUSTER_NAME must be set to the downstream cluster's management cluster id"
  exit 1
fi

# Role definition files are plain `export default {...}` modules (no other
# imports/exports) - swap the export for module.exports and compile them as
# CommonJS to get the full object as JSON, since grep can't safely pull the
# nested `rules` arrays out.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
role_json() {
  node -e '
    const fs = require("fs");
    const path = require("path");
    const Module = require("module");
    const file = process.argv[1];
    const src = fs.readFileSync(file, "utf8").replace("export default", "module.exports =");
    const m = new Module(file);
    m.filename = file;
    m.paths = Module._nodeModulePaths(path.dirname(file));
    m._compile(src, file);
    process.stdout.write(JSON.stringify(m.exports));
  ' "$1"
}

ADMIN_ROLE_JSON=$(role_json "$SCRIPT_DIR/../pkg/virtual-clusters/resources/virtual-cluster-admin-role.js")
POLICY_ROLE_JSON=$(role_json "$SCRIPT_DIR/../pkg/virtual-clusters/resources/virtual-cluster-policy-read-role.js")

echo "Logging in as admin.........."
TOKEN=""
for i in $(seq 1 60); do
  TOKEN=$(curl -sk -X POST "${TEST_BASE_URL}/v3-public/localProviders/local?action=login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"${CATTLE_BOOTSTRAP_PASSWORD}\"}" \
    | jq -r '.token // empty' 2>/dev/null || echo "")
  [ -n "$TOKEN" ] && break
  echo "  Login not ready yet... ($i/60)"
  sleep 5
done
if [ -z "$TOKEN" ]; then
  echo "Failed to obtain an admin token"
  exit 1
fi

# The two roles below are normally created client-side, the first time the
# extension loads for a logged-in admin (see createRoleIfNotFound in
# pkg/virtual-clusters/index.ts). We want to be able to create a standard user
# and run tests without necessarily running admin tests first, so create the
# roles here too if they're missing.
#
# RoleTemplate ids are server-generated, so in order to check existance
# and get the role ID to use in rolebindings, we need to check a ui-role-name label
# same mechanism that the UI extension relies on, including the use of the filter query param
find_role_id() {
  local role_ui_name="$1"

  curl -sk -G "${TEST_BASE_URL}/v1/management.cattle.io.roletemplates" \
    -H "Authorization: Bearer ${TOKEN}" \
    --data-urlencode "pagesize=100000" \
    --data-urlencode "filter=metadata.labels[management.cattle.io/ui-role-name] IN (${role_ui_name})" \
    --data-urlencode "exclude=metadata.managedFields" \
    | jq -r '.data[0].id // empty'
}

# Echoes the resolved (pre-existing or newly created) role id on stdout -
# all other output must go to stderr so it doesn't pollute that value when
# callers capture it via $(...).
ensure_role() {
  local role_json="$1"
  local role_ui_name
  local role_name
  local labels
  local role_id
  local create_body
  local create_resp

  role_ui_name=$(echo "$role_json" | jq -r '.metadata.labels["management.cattle.io/ui-role-name"]')
  role_name=$(echo "$role_json" | jq -r '.displayName')
  labels=$(echo "$role_json" | jq -c '.metadata.labels')

  role_id=$(find_role_id "$role_ui_name")
  if [ -n "$role_id" ]; then
    echo "  RoleTemplate '${role_name}' already exists (id: ${role_id})" >&2
    echo "$role_id"
    return
  fi

  create_body=$(echo "$role_json" | jq -c --arg name "$role_name" --argjson labels "$labels" \
    '{type: "roleTemplate", name: $name, context, description, rules, labels: $labels}
     + (if .roleTemplateNames then {roleTemplateIds: .roleTemplateNames} else {} end)')

  create_resp=$(curl -sk -X POST "${TEST_BASE_URL}/v3/roletemplates" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$create_body")

  role_id=$(echo "$create_resp" | jq -r '.id // empty')
  if [ -z "$role_id" ]; then
    echo "Failed to create RoleTemplate '${role_name}'. Response: ${create_resp}" >&2
    exit 1
  fi
  echo "  Created RoleTemplate '${role_name}' (id: ${role_id})" >&2
  echo "$role_id"
}

echo "Ensuring required RoleTemplates exist.........."
PROJECT_ROLE=$(ensure_role "$ADMIN_ROLE_JSON")
CLUSTER_ROLE=$(ensure_role "$POLICY_ROLE_JSON")

if [ -z "$PROJECT_ROLE" ] || [ -z "$CLUSTER_ROLE" ]; then
  echo "Failed to resolve role ids"
  exit 1
fi
echo "Project role id: ${PROJECT_ROLE}"
echo "Cluster role id: ${CLUSTER_ROLE}"

echo "Creating project '${PROJECT_NAME}'.........."
PROJECT_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v3/projects" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"project\",\"name\":\"${PROJECT_NAME}\",\"annotations\":{},\"labels\":{},\"clusterId\":\"${MGMT_CLUSTER_NAME}\",\"creatorId\":\"${MGMT_CLUSTER_NAME}://admin\",\"containerDefaultResourceLimit\":{},\"resourceQuota\":{},\"namespaceDefaultResourceQuota\":{}}")

PROJECT_ID=$(echo "$PROJECT_RESP" | jq -r '.id // empty')
if [ -z "$PROJECT_ID" ]; then
  echo "Failed to create project. Response: ${PROJECT_RESP}"
  exit 1
fi
echo "Project ID: ${PROJECT_ID}"

echo "Creating namespace '${NAMESPACE_NAME}' in project.........."
NAMESPACE_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v1/namespaces" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"metadata\":{\"annotations\":{\"field.cattle.io/containerDefaultResourceLimit\":\"{}\",\"field.cattle.io/projectId\":\"${PROJECT_ID}\"},\"labels\":{\"field.cattle.io/projectId\":\"${PROJECT_ID##*:}\",\"pod-security.kubernetes.io/enforce\":\"privileged\",\"pod-security.kubernetes.io/enforce-version\":\"latest\"},\"name\":\"${NAMESPACE_NAME}\"},\"disableOpenApiValidation\":false}")

NAMESPACE_ID=$(echo "$NAMESPACE_RESP" | jq -r '.id // empty')
if [ -z "$NAMESPACE_ID" ]; then
  echo "Failed to create namespace. Response: ${NAMESPACE_RESP}"
  exit 1
fi

echo "Creating user '${STANDARD_USER}'.........."
USER_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v1/management.cattle.io.users" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"user\",\"enabled\":true,\"mustChangePassword\":false,\"username\":\"${STANDARD_USER}\"}")

USER_ID=$(echo "$USER_RESP" | jq -r '.id // empty')
if [ -z "$USER_ID" ]; then
  echo "Failed to create user. Response: ${USER_RESP}"
  exit 1
fi
echo "User ID: ${USER_ID}"

# Without this, login succeeds (a token is issued) but the dashboard's
# post-login bootstrapping (fetching prefs/self-user/etc.) fails for a user
# with no global permissions at all, leaving the login button stuck in its
# error state. Every dashboard e2e spec that creates a standard user grants
# this same baseline role (see cy.createUser's `globalRole: { role: 'user' }`
# usage across rancher/dashboard's Cypress specs).
echo "Setting base 'user' global role.........."
GLOBAL_ROLE_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v3/globalrolebindings" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"globalRoleBinding\",\"globalRoleId\":\"user\",\"userId\":\"${USER_ID}\"}")

if [ -z "$(echo "$GLOBAL_ROLE_RESP" | jq -r '.id // empty')" ]; then
  echo "Failed to set global role binding. Response: ${GLOBAL_ROLE_RESP}"
  exit 1
fi

echo "Fetching user principal ID.........."
USER_PRINCIPAL_ID=""
for i in $(seq 1 10); do
  USER_DATA=$(curl -sk "${TEST_BASE_URL}/v1/management.cattle.io.users/${USER_ID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")

  USER_PRINCIPAL_ID=$(echo "$USER_DATA" | jq -r '.principalIds[0] // empty')
  [ -n "$USER_PRINCIPAL_ID" ] && break
  echo "  Principal ID not ready yet... ($i/10)"
  sleep 1
done
if [ -z "$USER_PRINCIPAL_ID" ]; then
  echo "Failed to fetch user principal ID. Response: ${USER_DATA}"
  exit 1
fi
echo "User Principal ID: ${USER_PRINCIPAL_ID}"

echo "Creating password secret for user.........."
SECRET_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v1/secrets" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"secret\",\"metadata\":{\"namespace\":\"cattle-local-user-passwords\",\"name\":\"${USER_ID}\"},\"data\":{\"password\":\"$(echo -n "${STANDARD_USER_PASSWORD}" | base64)\"}}")

SECRET_ID=$(echo "$SECRET_RESP" | jq -r '.id // empty')
if [ -z "$SECRET_ID" ]; then
  echo "Failed to create password secret. Response: ${SECRET_RESP}"
  exit 1
fi

echo "Setting '${PROJECT_ROLE}' project role.........."
PROJECT_ROLE_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v3/projectroletemplatebindings" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"projectroletemplatebinding\",\"roleTemplateId\":\"${PROJECT_ROLE}\",\"userPrincipalId\":\"${USER_PRINCIPAL_ID}\",\"projectId\":\"${PROJECT_ID}\"}")

if [ -z "$(echo "$PROJECT_ROLE_RESP" | jq -r '.id // empty')" ]; then
  echo "Failed to set project role binding. Response: ${PROJECT_ROLE_RESP}"
  exit 1
fi

echo "Setting '${CLUSTER_ROLE}' cluster role.........."
CLUSTER_ROLE_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v3/clusterroletemplatebindings" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"clusterRoleTemplateBinding\",\"clusterId\":\"${MGMT_CLUSTER_NAME}\",\"roleTemplateId\":\"${CLUSTER_ROLE}\",\"userPrincipalId\":\"${USER_PRINCIPAL_ID}\"}")

if [ -z "$(echo "$CLUSTER_ROLE_RESP" | jq -r '.id // empty')" ]; then
  echo "Failed to set cluster role binding. Response: ${CLUSTER_ROLE_RESP}"
  exit 1
fi

echo "Verifying standard user can log in.........."
STANDARD_USER_TOKEN=""
for i in $(seq 1 10); do
  LOGIN_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v3-public/localProviders/local?action=login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${STANDARD_USER}\",\"password\":\"${STANDARD_USER_PASSWORD}\"}")

  STANDARD_USER_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.token // empty')
  [ -n "$STANDARD_USER_TOKEN" ] && break
  echo "  Login not ready yet... ($i/10)"
  sleep 1
done
if [ -z "$STANDARD_USER_TOKEN" ]; then
  echo "Failed to log in as standard user '${STANDARD_USER}'. Response: ${LOGIN_RESP}"
  exit 1
fi

echo "Standard user bootstrapped"
echo "  Username: ${STANDARD_USER}"
echo "  Project: ${PROJECT_NAME}"
echo "  Namespace: ${NAMESPACE_NAME}"
