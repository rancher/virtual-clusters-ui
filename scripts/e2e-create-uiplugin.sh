#!/usr/bin/env bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Build and serve the extension, then register it with Rancher directly via
# the Steve API - a scriptable stand-in for the UI-driven "Developer Load"
# dialog (@rancher/shell shell/dialog/DeveloperLoadExtensionDialog.vue).
# Mirrors the exact resource shape that dialog creates
# (POST /v1/catalog.cattle.io.uiplugin)
# ---------------------------------------------------------------------------

TEST_BASE_URL=${TEST_BASE_URL:-https://127.0.0.1.sslip.io}
CATTLE_BOOTSTRAP_PASSWORD=${CATTLE_BOOTSTRAP_PASSWORD:-password}
EXTENSION_SERVER_PORT=${EXTENSION_SERVER_PORT:-8080}
EXTENSION_NAME=virtual-clusters

PKG_VERSION=$(jq -r '.version' pkg/virtual-clusters/package.json)
EXTENSIONS_VERSION_RANGE=$(jq -r '.rancher.annotations["catalog.cattle.io/ui-extensions-version"]' pkg/virtual-clusters/package.json)
# build-pkg names the output dir/bundle "<pkg>-<version>" (see
# @rancher/shell scripts/build-pkg.sh), so both the CRD name and the served
# bundle path need that combined name, not the bare package name.
NAME_WITH_VERSION="${EXTENSION_NAME}-${PKG_VERSION}"

echo -e "${YELLOW}Building the extension..........${RESET}"
yarn build-pkg "$EXTENSION_NAME"

echo -e "${YELLOW}Serving the extension on port ${EXTENSION_SERVER_PORT}..........${RESET}"
PORT="$EXTENSION_SERVER_PORT" nohup node node_modules/@rancher/shell/scripts/serve-pkgs > serve-pkgs.log 2>&1 &
sleep 3

# wait up to 30 seconds for the extension server to be ready (returns a non-4xx/5xx response)
if ! curl --fail --silent --retry 30 --retry-connrefused --retry-delay 1 "http://127.0.0.1:${EXTENSION_SERVER_PORT}/" > /dev/null; then
   echo -e "${RED}Extension server failed to become ready${RESET}"
   cat serve-pkgs.log
   exit 1
fi

EXTENSION_ENDPOINT="http://127.0.0.1:${EXTENSION_SERVER_PORT}/${NAME_WITH_VERSION}/${NAME_WITH_VERSION}.umd.min.js"

echo -e "${YELLOW}Logging in to Rancher..........${RESET}"


TOKEN=$(curl -sk -X POST "${TEST_BASE_URL}/v3-public/localProviders/local?action=login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"${CATTLE_BOOTSTRAP_PASSWORD}\"}" \
  | jq -r '.token // empty' 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
  echo -e "${RED}Failed to login as global admin${RESET}"
  exit 1
fi

echo -e "${YELLOW}Registering the extension with Rancher..........${RESET}"
curl -sk --fail-with-body -X POST "${TEST_BASE_URL}/v1/catalog.cattle.io.uiplugin" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"catalog.cattle.io.uiplugin\",
    \"metadata\": { \"name\": \"${NAME_WITH_VERSION}\", \"namespace\": \"cattle-ui-plugin-system\" },
    \"spec\": {
      \"plugin\": {
        \"name\": \"${EXTENSION_NAME}-developer-load\",
        \"version\": \"${PKG_VERSION}\",
        \"endpoint\": \"${EXTENSION_ENDPOINT}\",
        \"noCache\": true,
        \"noAuth\": true,
        \"metadata\": {
          \"catalog.cattle.io/ui-extensions-version\": \"${EXTENSIONS_VERSION_RANGE}\",
          \"developer\": \"true\",
          \"direct\": \"true\"
        }
      }
    }
  }"

echo
echo -e "${GREEN}${BOLD}Extension registered, served at ${EXTENSION_ENDPOINT}${RESET}"
