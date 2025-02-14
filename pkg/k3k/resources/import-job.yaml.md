apiVersion: v1
kind: ConfigMap
metadata:
  namespace: k3k-K3K_NAMESPACE
  name: cluster-import-script
data:
  import.sh: |-
    SERVERCA=`cat /varlibrancher/server/tls/server-ca.crt`
    CLIENTCA=`cat /varlibrancher/server/tls/client-admin.crt`
    CLIENTKEY=`cat /varlibrancher/server/tls/client-admin.key`
    kubectl config set-cluster default --server="https://k3k-K3K_NAMESPACE-service:6443" --certificate-authority='/varlibrancher/server/tls/server-ca.crt'
    kubectl config set-credentials default --client-certificate="/varlibrancher/server/tls/client-admin.crt" --client-key="/varlibrancher/server/tls/client-admin.key"
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
    kubectl get pods -n cattle-system
    echo "All Done"
---
apiVersion: batch/v1
kind: Job
metadata:
  namespace: k3k-K3K_NAMESPACE
  name: import-virtual-cluster
spec:
  template:
    spec:
      containers:
      - name: import
        image: rancher/shell:head
        command: ["sh", "/scripts/import.sh"]
        env:
          - name: RANCHER_IMPORT_URL
            value: "__url"
        volumeMounts:
          - mountPath: "/scripts"
            name: scripts
            readOnly: true
          - mountPath: "/bootstrap"
            name: bootstrap
            readOnly: true
          - mountPath: "/varlibrancher"
            name: varlibrancher
            readOnly: true
      restartPolicy: Never
      securityContext:
        runAsUser: 0
        allowPrivilegeEscalation: false
      volumes:
        - name: scripts
          configMap:
            name: cluster-import-script
        - name: bootstrap
          secret:
            secretName: k3k-K3K_NAMESPACE-bootstrap
        - name: varlibrancher
          persistentVolumeClaim:
            claimName: varlibrancherk3s-k3k-K3K_NAMESPACE-server-0
  backoffLimit: 4
