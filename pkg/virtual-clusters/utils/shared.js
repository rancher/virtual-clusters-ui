export const MODES = {
  SHARED:  'shared',
  VIRTUAL: 'virtual',
  HCP:     'hcp'
};

// a cluster without an expose type is only reachable on its ClusterIP, from inside the host cluster
export function isApiServerExposed(expose) {
  return !!(expose?.ingress || expose?.loadBalancer || expose?.nodePort);
}

// ingress and priority class sync are the shared mode options the sync section exposes
// the rest of spec.sync does not depend on the mode, so it keeps its value
export function resetModeSpecificSync(sync) {
  const { ingresses, priorityClasses, ...rest } = sync || {};

  return rest;
}
