import { K3K } from "../types";

export function init($plugin:any, store:any) {
  const {
    product,
    configureType,
    virtualType,
    basicType
  } = $plugin.DSL(store, 'manager');
  
  configureType('provisioning.cattle.io.cluster', {
    listGroups: [  
      {
        icon:          'icon-folder',
        field:         'groupByParent',
        value:         'groupByParent',
        groupLabelKey: 'groupByParent',
        tooltipKey:    'k3k.hostCluster.label'
      }
    ],
  });

  }