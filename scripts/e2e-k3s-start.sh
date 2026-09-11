#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# Stand up k3s + Rancher from the SUSE Prime channel, pinned to a
# specific minor line. The extension is annotated prime-only, so
# Rancher setup is a little different than what is used in dashboard CI. 
#   - the chart's own default server image must be left alone: no
#     image.repository / image.tag / systemDefaultRegistry overrides, or the
#     prime image gets replaced with a community one
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

RANCHER_HELM_REPO_URL=${RANCHER_HELM_REPO_URL:-https://charts.optimus.rancher.io/server-charts/latest}
CHART_VERSION_PREFIX=${CHART_VERSION_PREFIX:?CHART_VERSION_PREFIX must be set (e.g. 2.16)}
KUBE_VERSION=${KUBE_VERSION:?KUBE_VERSION must be set (e.g. v1.36.2+k3s1)}
CATTLE_BOOTSTRAP_PASSWORD=${CATTLE_BOOTSTRAP_PASSWORD:-password}
TEST_BASE_URL=${TEST_BASE_URL:-https://127.0.0.1.sslip.io}

DASHBOARD_URL="${TEST_BASE_URL#https://}"
RANCHER_HELM_REPO_NAME=rancher-latest

echo -e "${CYAN}--------------------------------------${RESET}"
echo -e "${BOLD}virtual-clusters e2e - Rancher Prime via Helm${RESET}"
echo
echo "RANCHER_HELM_REPO_URL: ${RANCHER_HELM_REPO_URL}"
echo "CHART_VERSION_PREFIX:  ${CHART_VERSION_PREFIX}"
echo "KUBE_VERSION:          ${KUBE_VERSION}"
echo "TEST_BASE_URL:         ${TEST_BASE_URL}"
echo -e "${CYAN}--------------------------------------${RESET}"

echo -e "${YELLOW}Installing k3s (with kubectl)..........${RESET}"
# The install script is pulled from this versioned url so we can verify this checksum
# but it can be used to install any version by setting INSTALL_K3S_VERSION
export K3S_CHECKSUM=8598e002e61d658fed7b7542fc6d2c66d8da6eae69e088830105d2ee1ffb6d91
curl -sfL -o k3s-script https://raw.githubusercontent.com/k3s-io/k3s/v1.35.3%2Bk3s1/install.sh

DOWNLOADED_CHECKSUM=$(sha256sum k3s-script | awk '{print $1}')
if [ "$DOWNLOADED_CHECKSUM" != "${K3S_CHECKSUM}" ]; then
  echo -e "${RED}Error: K3S checksum mismatch! Expected ${K3S_CHECKSUM} but got $DOWNLOADED_CHECKSUM${RESET}"
  exit 1
fi

chmod +x k3s-script
INSTALL_K3S_VERSION="$KUBE_VERSION" sh k3s-script

export KUBECONFIG=~/.kube/config
mkdir -p ~/.kube
sudo k3s kubectl config view --raw > "$KUBECONFIG"
chmod 600 "$KUBECONFIG"

echo -e "${YELLOW}Installing helm..........${RESET}"
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

echo -e "${YELLOW}Installing cert-manager..........${RESET}"
kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.7.1/cert-manager.crds.yaml
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.7.1
kubectl get pods --namespace cert-manager

echo -e "${YELLOW}Setting up the Rancher Prime repo..........${RESET}"
helm repo add $RANCHER_HELM_REPO_NAME $RANCHER_HELM_REPO_URL
helm repo update

# A single channel carries releases for every minor line
# so we have to find the latest version that matches the major/minor specified in CHART_VERSION_PREFIX
RANCHER_CHART_VERSION=$(helm search repo $RANCHER_HELM_REPO_NAME/rancher --versions --devel -o json \
  | jq -r --arg prefix "${CHART_VERSION_PREFIX}." --arg repo "$RANCHER_HELM_REPO_URL" '
      [.[] | select(.version | startswith($prefix))] as $matches
      | if ($matches | length) == 0
        then error("No chart version found on prefix \($prefix) in \($repo)")
        else ($matches | first | .version)
        end
    ')
echo -e "${CYAN}Selected Rancher chart version: ${RANCHER_CHART_VERSION}${RESET}"

echo -e "${YELLOW}Installing Rancher..........${RESET}"
kubectl create ns cattle-system
helm install rancher $RANCHER_HELM_REPO_NAME/rancher \
  --namespace cattle-system \
  --version "$RANCHER_CHART_VERSION" \
  --devel \
  --set hostname="$DASHBOARD_URL" \
  --set replicas="1" \
  --set extraEnv\[0\].name="CATTLE_UI_OFFLINE_PREFERRED" \
  --set-string extraEnv\[0\].value="true" \
  --set extraEnv\[1\].name="CATTLE_BOOTSTRAP_PASSWORD" \
  --set-string extraEnv\[1\].value="${CATTLE_BOOTSTRAP_PASSWORD}" \
  --set extraEnv\[2\].name="CATTLE_PASSWORD_MIN_LENGTH" \
  --set-string extraEnv\[2\].value="3"

echo -e "${YELLOW}Waiting for Rancher to come up..........${RESET}"
kubectl -n cattle-system rollout status deploy/rancher --timeout=600s


echo -e "${YELLOW}Waiting for dashboard UI to be reachable..........${RESET}"
okay=0
STATUS=""
while [ $okay -lt 60 ]; do
  STATUS=$(curl --silent --location --head -k "$TEST_BASE_URL/dashboard/" | awk -F'HTTP/2 ' '{print $2}' | awk 'length { print $1}')
  echo "Status: $STATUS (Try: $okay)"
  if [ "$STATUS" == "200" ]; then
    break
  fi
  okay=$((okay+1))
  sleep 5
done

if [ "$STATUS" != "200" ]; then
  echo -e "${RED}Dashboard did not become available in a reasonable time${RESET}"
  kubectl -n cattle-system get pods
  exit 1
fi

# additional checks to verify Rancher is running successfully
# it is possible for the UI to become reachable but still have critical Rancher components in an unready state
# leading to test failures
wait=60
echo -e "${YELLOW}Waiting for rancher-webhook to be running...${RESET}"
okay=0
while [ $okay -lt $wait ] ; do
  if kubectl -n cattle-system get po -l app=rancher-webhook | grep -q '1/1.*Running' ; then
    break
  else
    echo "Webhook not ready, checking again in 10s (total time waited: $((okay * 10))s)..."
    okay=$((okay+1))
    sleep 10
  fi
done

if [ $okay -eq $wait ]; then
  echo -e "${RED}Rancher webhook did not become ready in a reasonable time${RESET}"
  exit 1
fi

echo -e "${YELLOW}Waiting for capi-webhook-service to exist...${RESET}"
okay=0
while [ $okay -lt $wait ] ; do
  if kubectl -n cattle-capi-system get service capi-webhook-service | grep '443/TCP' ; then
    break
  else
    echo "capi-webhook-service does not exist, checking again in 10s (total time waited: $((okay * 10))s)..."
    kubectl get service --all-namespaces
    okay=$((okay+1))
    sleep 10
  fi
done

if [ $okay -eq $wait ]; then
  echo -e "${RED}CAPI webhook service did not become available in a reasonable time${RESET}"
  exit 1
fi

echo -e "${YELLOW}Waiting for rancher imperative api to be running...${RESET}"
okay=0
while [ $okay -lt $wait ] ; do
  STATUS=$(kubectl get apiservice v1.ext.cattle.io -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null)

  if [ "$STATUS" = "True" ]; then
    break
  else
    echo "Rancher imperative api not ready, checking again in 10s (total time waited: $((okay * 10))s)..."
    okay=$((okay+1))
    sleep 10
  fi
done

if [ $okay -eq $wait ]; then
  echo -e "${RED}Rancher imperative api did not become ready in a reasonable time${RESET}"
  exit 1
fi

echo -e "${GREEN}${BOLD}Rancher is ready${RESET}"