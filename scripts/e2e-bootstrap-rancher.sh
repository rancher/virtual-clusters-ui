#!/usr/bin/env bash
set -e

# Accepts the EULA and sets the server URL, mirroring the bootstrap curl loop
# rancher/dashboard runs in its own CI (scripts/e2e-extension-k3s-start.sh
# callers). This allows virtual clusters tests to skip the initial Rancher stetup flow, which is tested in the dashboard repo. 
# This is retried because rancher-webhook can briefly be unavailable right
# after boot, which otherwise makes login return no token.


TEST_BASE_URL=${TEST_BASE_URL:-https://127.0.0.1.sslip.io}
CATTLE_BOOTSTRAP_PASSWORD=${CATTLE_BOOTSTRAP_PASSWORD:-password}

TOKEN=""
for i in $(seq 1 60); do
  TOKEN=$(curl -sk -X POST "${TEST_BASE_URL}/v3-public/localProviders/local?action=login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"${CATTLE_BOOTSTRAP_PASSWORD}\"}" \
    | jq -r '.token // empty' 2>/dev/null || echo "")
  if [ -n "$TOKEN" ]; then
    echo "Logged in after $i attempt(s)"
    break
  fi
  echo "  Login not ready yet... ($i/60)"
  sleep 5
done
if [ -z "$TOKEN" ]; then
  echo "Failed to obtain an admin token"
  exit 1
fi

curl -sk -X PUT "${TEST_BASE_URL}/v3/settings/server-url" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"server-url","value":"'"${TEST_BASE_URL}"'"}'

curl -sk -X PUT "${TEST_BASE_URL}/v3/settings/eula-agreed" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"eula-agreed","value":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'"}'

curl -sk -X PUT "${TEST_BASE_URL}/v3/settings/first-login" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"first-login","value":"false"}'

echo "Rancher bootstrapped"
