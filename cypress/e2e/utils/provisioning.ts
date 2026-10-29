import CruK3kPo from '../po/cru-k3k.po';

// title of components/Sync/NotAllowed.vue, shown in every mode except shared
export const NOT_ALLOWED = /Not available in \w+ mode/;

export function openCreateForm(): CruK3kPo {
  const cruK3k = CruK3kPo.goToCreate();

  cruK3k.waitForHostClusterLoad();

  return cruK3k;
}
