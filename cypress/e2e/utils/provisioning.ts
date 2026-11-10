import CruK3kPo from '../po/cru-k3k.po';

// name of a downstream cluster to use as the host cluster, set with TEST_HOST_CLUSTER
// the default is the k3d cluster CI imports (scripts/e2e-import-generic-cluster.sh)
export const HOST_CLUSTER = Cypress.env('hostCluster') || 'e2e-generic';

// title of components/Sync/NotAllowed.vue, shown in every mode except shared
export const NOT_ALLOWED = /Not available in \w+ mode/;

export function openCreateForm(): CruK3kPo {
  const cruK3k = CruK3kPo.goToCreate();

  cruK3k.waitForHostClusterLoad();

  return cruK3k;
}
