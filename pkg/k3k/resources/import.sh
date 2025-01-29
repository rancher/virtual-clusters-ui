 SERVERCA=`cat /varlibrancher/server/tls/server-ca.crt`
    CLIENTCA=`cat /varlibrancher/server/tls/client-admin.crt`
    CLIENTKEY=`cat /varlibrancher/server/tls/client-admin.key`
    kubectl config set-cluster default --server="https://k3k-K3K_NAMESPACE-service-headless:6443" --insecure-skip-tls-verify=true 
    kubectl --set-raw-bytes=true config set clusters.default.certificate-authority-data -- "$SERVERCA" 
    kubectl --set-raw-bytes=true config set users.default.client-certificate-data -- "$CLIENTCA"
    kubectl --set-raw-bytes=true config set users.default.client-key-data -- "$CLIENTKEY"
    kubectl config set-context default --cluster default --user default
    kubectl config use-context default
    kubectl config view --raw
    echo ${RANCHER_IMPORT_URL}
    echo "Waiting for k8s to be ready"
    kubectl get po -A
    while [ $? -ne 0 ]; do
      sleep 5
      kubectl get po -A
    done
    echo "Importing Virtual Cluster ..."
    curl --insecure -sfL ${RANCHER_IMPORT_URL} | kubectl apply -f -
    kubectl get pods -n cattle-system --watch
    echo "All Done"