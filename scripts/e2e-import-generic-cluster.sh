#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# Bring up a k3d cluster and import it into the Rancher instance started by
# e2e-k3s-start.sh, as a generic (imported) cluster 
#   1. POST /v3/clusters creates the management.cattle.io.cluster directly -
#      this mirrors our genric import cluster UI (see
#      @rancher/shell pkg/imported/components/CruImported.vue)
#   2. the registration command lives on
#      /v1/management.cattle.io.clusterregistrationtoken, namespaced by that
#      management cluster name (id from step 1)
#   3. running that command against the target cluster's kubeconfig
#      registers it with Rancher
#
# NOTE: step 2's exact field (status.insecureCommand on the v1 resource) is
# inferred, not confirmed against a live cluster - rancher/dashboard's own
# UI reads the equivalent field from the older Norman
# /v3/clusterregistrationtokens API instead, so there is no in-repo
# precedent for the v1 shape. Verify this against a real Rancher instance
# and adjust if the field lives elsewhere.
# ---------------------------------------------------------------------------

TEST_BASE_URL=${TEST_BASE_URL:-https://127.0.0.1.sslip.io}
CATTLE_BOOTSTRAP_PASSWORD=${CATTLE_BOOTSTRAP_PASSWORD:-password}
CLUSTER_NAME=${CLUSTER_NAME:-e2e-generic}
K3D_KUBECONFIG=${K3D_KUBECONFIG:-$HOME/.kube/k3d-${CLUSTER_NAME}.yaml}

echo "Installing k3d.........."
K3D_INSTALL_VERSION=${K3D_INSTALL_VERSION:-v5.9.0}
curl -s "https://raw.githubusercontent.com/k3d-io/k3d/${K3D_INSTALL_VERSION}/install.sh" | TAG="$K3D_INSTALL_VERSION" bash

echo "Creating k3d cluster '${CLUSTER_NAME}'.........."
k3d cluster create "$CLUSTER_NAME" --wait
k3d kubeconfig get "$CLUSTER_NAME" > "$K3D_KUBECONFIG"

echo "Logging in to Rancher.........."
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

echo "Creating the norman cluster '${CLUSTER_NAME}'.........."
CLUSTER_RESP=$(curl -sk -X POST "${TEST_BASE_URL}/v3/clusters" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"cluster\",\"name\":\"${CLUSTER_NAME}\",\"agentEnvVars\":[],\"importedConfig\":{},\"labels\":{},\"annotations\":{\"rancher.io/imported-cluster-version-management\":\"system-default\"}}")

MGMT_CLUSTER_NAME=$(echo "$CLUSTER_RESP" | jq -r '.id')
echo "Management cluster name: ${MGMT_CLUSTER_NAME}"
echo "MGMT_CLUSTER_NAME=${MGMT_CLUSTER_NAME}" >> "$GITHUB_ENV"

echo "Fetching the registration command.........."
REGISTRATION_COMMAND=""
for i in $(seq 1 60); do
  TOKEN_RESP=$(curl -sk -H "Authorization: Bearer ${TOKEN}" \
    "${TEST_BASE_URL}/v1/management.cattle.io.clusterregistrationtoken/${MGMT_CLUSTER_NAME}")

  COUNT=$(echo "$TOKEN_RESP" | jq '.data | length' 2>/dev/null || echo 0)

  if [ "$COUNT" = "0" ]; then
    # No token exists yet for this cluster - create one.
    curl -sk -X POST "${TEST_BASE_URL}/v1/management.cattle.io.clusterregistrationtoken" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"management.cattle.io.clusterregistrationtoken\",\"metadata\":{\"generateName\":\"${MGMT_CLUSTER_NAME}-\",\"namespace\":\"${MGMT_CLUSTER_NAME}\"},\"spec\":{\"clusterName\":\"${MGMT_CLUSTER_NAME}\"}}" > /dev/null
  else
    REGISTRATION_COMMAND=$(echo "$TOKEN_RESP" | jq -r '.data[0].status.insecureCommand // empty' 2>/dev/null || echo "")
  fi

  [ -n "$REGISTRATION_COMMAND" ] && break
  echo "  Registration command not ready yet... ($i/60)"
  sleep 5
done

if [ -z "$REGISTRATION_COMMAND" ]; then
  echo "Failed to obtain the cluster registration command"
  exit 1
fi

echo "Registering the k3d cluster with Rancher.........."
KUBECONFIG="$K3D_KUBECONFIG" bash -c "$REGISTRATION_COMMAND"

echo "Waiting for '${CLUSTER_NAME}' to become active.........."
for i in $(seq 1 60); do
  STATE=$(curl -sk -H "Authorization: Bearer ${TOKEN}" "${TEST_BASE_URL}/v3/clusters/${MGMT_CLUSTER_NAME}" \
    | jq -r '.state // empty' 2>/dev/null || echo "")
  if [ "$STATE" = "active" ]; then
    echo "Cluster is active"
    exit 0
  fi
  echo "  State: ${STATE:-unknown} ($i/60)"
  sleep 10
done

echo "Cluster did not become active in time"
exit 1
