import { K3K } from "../types";

export const  NAME = 'virtualclusters'

export function init($plugin:any, store:any) {
  const {
    product,
    configureType,
    virtualType,
    basicType
  } = $plugin.DSL(store, NAME);
  



  product({
    label: 'Virtual Clusters',
    inStore:             'cluster',
    inExplorer:          true,
    icon:                'k3k',
    removeable:          false,
    showNamespaceFilter: true
  });


    virtualType({
    label:       'Virtual Clusters',
    icon:        'k3k',
    name:        'virtual-cluster-dashboard',
    namespaced:  false,
    weight:      99,
    route:                  {
      name:   `c-cluster-virtualclusters`,
    },
    overview: true,
    exact:    true,
  });

  basicType(['virtual-cluster-dashboard', K3K.POLICY, K3K.CLUSTER])


  }