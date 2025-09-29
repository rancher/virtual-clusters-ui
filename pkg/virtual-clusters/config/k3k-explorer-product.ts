import { K3K } from "../types";

export function init($plugin:any, store:any) {
  const {
    product,
    configureType,
    virtualType,
    basicType
  } = $plugin.DSL(store, 'virtual-clusters');
  



  product({
    label: 'Virtual Clusters',
    inStore:             'cluster',
    inExplorer:          true,
    icon:                'k3k',
    removeable:          false,
    showNamespaceFilter: true
    //TODO nb ifhave k3k
  });


  basicType(K3K.POLICY)


  }