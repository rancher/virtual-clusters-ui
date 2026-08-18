#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# Stand up k3s + Rancher from the SUSE Prime alpha channel, pinned to a
# specific minor line. The extension is annotated prime-only, so
# Rancher setup is a little different than what is used in dashboard CI. 
#   - the chart MUST come from the alpha channel, not the per-line optimus
#     release-2.XX channels - those are community, not prime
#   - the chart's own default server image must be left alone: no
#     image.repository / image.tag / systemDefaultRegistry overrides, or the
#     prime image gets replaced with a community one
# ---------------------------------------------------------------------------

RANCHER_HELM_REPO_URL=${RANCHER_HELM_REPO_URL:-https://charts.optimus.rancher.io/server-charts/alpha}
CHART_VERSION_PREFIX=${CHART_VERSION_PREFIX:?CHART_VERSION_PREFIX must be set (e.g. 2.16)}
KUBE_VERSION=${KUBE_VERSION:?KUBE_VERSION must be set (e.g. v1.36.2+k3s1)}
CATTLE_BOOTSTRAP_PASSWORD=${CATTLE_BOOTSTRAP_PASSWORD:-password}
TEST_BASE_URL=${TEST_BASE_URL:-https://127.0.0.1.sslip.io}

DASHBOARD_URL="${TEST_BASE_URL#https://}"
RANCHER_NAMESPACE=cattle-system
RANCHER_HELM_REPO_NAME=rancher-alpha

echo "--------------------------------------"
echo "virtual-clusters e2e - Rancher Prime via Helm"
echo
echo "RANCHER_HELM_REPO_URL: ${RANCHER_HELM_REPO_URL}"
echo "CHART_VERSION_PREFIX:  ${CHART_VERSION_PREFIX}"
echo "KUBE_VERSION:          ${KUBE_VERSION}"
echo "TEST_BASE_URL:         ${TEST_BASE_URL}"
echo "--------------------------------------"

echo "Installing k3s (with kubectl).........."
# The install.sh itself is version-agnostic; INSTALL_K3S_VERSION selects the binary.
curl -sfL -o k3s-script https://raw.githubusercontent.com/k3s-io/k3s/v1.35.3%2Bk3s1/install.sh
chmod +x k3s-script
INSTALL_K3S_VERSION="$KUBE_VERSION" sh k3s-script

export KUBECONFIG=~/.kube/config
mkdir -p ~/.kube
sudo k3s kubectl config view --raw > "$KUBECONFIG"
chmod 600 "$KUBECONFIG"

echo "Installing helm.........."
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

echo "Installing cert-manager.........."
kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.7.1/cert-manager.crds.yaml
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.7.1
kubectl get pods --namespace cert-manager

echo "Setting up the Rancher Prime alpha repo.........."
helm repo add $RANCHER_HELM_REPO_NAME $RANCHER_HELM_REPO_URL
helm repo update

# A single alpha channel carries alphas for every minor line, so without
# pinning a version here every row of the CI matrix would resolve to the
# same newest alpha and the matrix would collapse to identical runs.
RANCHER_CHART_VERSION=$(helm search repo $RANCHER_HELM_REPO_NAME/rancher --versions --devel -o json \
  | jq -r --arg prefix "${CHART_VERSION_PREFIX}." --arg repo "$RANCHER_HELM_REPO_URL" '
      [.[] | select(.version | startswith($prefix))] as $matches
      | if ($matches | length) == 0
        then error("No chart version found on prefix \($prefix) in \($repo)")
        else ($matches | sort_by(.version) | last | .version)
        end
    ')
echo "Resolved chart version: ${RANCHER_CHART_VERSION}"

echo "Installing Rancher.........."
kubectl create ns $RANCHER_NAMESPACE
helm install rancher $RANCHER_HELM_REPO_NAME/rancher \
  --namespace $RANCHER_NAMESPACE \
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

echo "Waiting for Rancher to come up.........."
kubectl -n $RANCHER_NAMESPACE rollout status deploy/rancher --timeout=600s

echo "Waiting for dashboard UI to be reachable.........."
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
  echo "Dashboard did not become available in a reasonable time"
  kubectl -n $RANCHER_NAMESPACE get pods
  exit 1
fi

echo "Waiting for rancher-webhook to be running.........."
okay=0
while [ $okay -lt 30 ]; do
  if kubectl -n $RANCHER_NAMESPACE get po -l app=rancher-webhook | grep -q '1/1.*Running'; then
    break
  fi
  echo "Webhook not ready, checking again in 10s..."
  okay=$((okay+1))
  sleep 10
done

echo "Rancher is ready"
