import {
  apiRequest, createVirtualClusterStub, deleteResource, waitForResource,
  K3K_CLUSTER_TYPE, K3K_MODE_ANNOTATION, K3K_NAMESPACE_ANNOTATION, PARENT_CLUSTER_ANNOTATION
} from './rancher-api';

// namespace for rancher provisioning objects in the local cluster
export const CLUSTER_NAMESPACE = 'fleet-default';

// polling to delete the k3k cluster ns
const RESOURCE_RETRIES = 80;

export interface VirtualCluster {
  hostClusterId: string;
  name: string;
  namespace: string;
}

function hostPrefix(vc: VirtualCluster) {
  return `k8s/clusters/${ vc.hostClusterId }/v1`;
}

// the import job and config map
function importName(vc: VirtualCluster) {
  return `import-${ vc.name }`;
}

function expectCreated(resp: Cypress.Response<any>, what: string) {
  expect(resp.status, `create ${ what }`).to.eq(201);
}


export function createVirtualClusterResources(vc: VirtualCluster) {
  const prefix = hostPrefix(vc);

  apiRequest({
    method: 'POST',
    url:    `/${ prefix }/namespaces`,
    body:   { type: 'namespace', metadata: { name: vc.namespace } },
  }).then((resp) => expectCreated(resp, `namespace ${ vc.namespace }`));

  apiRequest({
    method: 'POST',
    url:    `/${ prefix }/${ K3K_CLUSTER_TYPE }s`,
    body:   {
      type:       K3K_CLUSTER_TYPE,
      apiVersion: 'k3k.io/v1beta1',
      kind:       'Cluster',
      metadata:   { name: vc.name, namespace: vc.namespace },
      spec:       {
        mode: 'shared', servers: 1, agents: 0, persistence: { type: 'ephemeral' }
      },
    },
  }).then((resp) => expectCreated(resp, `k3k cluster ${ vc.name }`));

  apiRequest({
    method: 'POST',
    url:    `/${ prefix }/configmaps`,
    body:   {
      type: 'configmap', metadata: { name: importName(vc), namespace: vc.namespace }, data: {}
    },
  }).then((resp) => expectCreated(resp, `config map ${ importName(vc) }`));

  apiRequest({
    method: 'POST',
    url:    `/${ prefix }/batch.jobs`,
    body:   {
      type:       'batch.job',
      apiVersion: 'batch/v1',
      kind:       'Job',
      metadata:   { name: importName(vc), namespace: vc.namespace },
      spec:       {
        suspend:  true,
        template: { spec: { restartPolicy: 'Never', containers: [{ name: 'import', image: 'busybox' }] } }
      },
    },
  }).then((resp) => expectCreated(resp, `job ${ importName(vc) }`));

  return createVirtualClusterStub(vc.name, CLUSTER_NAMESPACE, {
    [PARENT_CLUSTER_ANNOTATION]: vc.hostClusterId,
    [K3K_NAMESPACE_ANNOTATION]:  vc.namespace,
    [K3K_MODE_ANNOTATION]:       'shared',
  });
}

function checkPresence(prefix: string, resourceType: string, id: string, present: boolean) {
  return waitForResource(prefix, resourceType, id, (resp) => {
    if (!present) {
      return resp.status === 404;
    }

    // a resource that is being deleted still answers 200 until its finalizers run
    return resp.status === 200 && !resp.body?.metadata?.deletionTimestamp;
  }, RESOURCE_RETRIES).then((settled) => {
    expect(settled, `${ resourceType }/${ id } ${ present ? 'exists' : 'is removed' }`).to.eq(true);
  });
}

export function checkProvisioningCluster(vc: VirtualCluster, present: boolean) {
  if (present) {
    return checkPresence('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, vc.name, true);
  }

  // a user who is not an admin gets 403, not 404, for a provisioning cluster that no longer exists
  // so wait for it to leave the namespace's list, which the user can read
  return waitForResource('v1', 'provisioning.cattle.io.clusters', CLUSTER_NAMESPACE, (resp) => {
    return resp.status === 200 && !(resp.body?.data || []).some((c: any) => c?.metadata?.name === vc.name);
  }, RESOURCE_RETRIES).then((settled) => {
    expect(settled, `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }/${ vc.name } is removed`).to.eq(true);
  });
}

export function checkK3kCluster(vc: VirtualCluster, present: boolean) {
  return checkPresence(hostPrefix(vc), `${ K3K_CLUSTER_TYPE }s/${ vc.namespace }`, vc.name, present);
}

export function checkNamespace(vc: VirtualCluster, present: boolean) {
  return checkPresence(hostPrefix(vc), 'namespaces', vc.namespace, present);
}

export function checkImportJob(vc: VirtualCluster, present: boolean) {
  return checkPresence(hostPrefix(vc), `batch.jobs/${ vc.namespace }`, importName(vc), present);
}

export function checkImportConfigMap(vc: VirtualCluster, present: boolean) {
  return checkPresence(hostPrefix(vc), `configmaps/${ vc.namespace }`, importName(vc), present);
}

// clean up after tests - best effort
export function deleteVirtualClusterResources(vc: VirtualCluster) {
  const prefix = hostPrefix(vc);

  deleteResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, vc.name);
  deleteResource(prefix, `batch.jobs/${ vc.namespace }`, importName(vc));
  deleteResource(prefix, `configmaps/${ vc.namespace }`, importName(vc));
  deleteResource(prefix, `${ K3K_CLUSTER_TYPE }s/${ vc.namespace }`, vc.name);

  return deleteResource(prefix, 'namespaces', vc.namespace);
}
