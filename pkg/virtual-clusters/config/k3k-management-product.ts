import { isRancherPrime } from '@shell/config/version';

export function init($plugin:any, store:any) {
  const {
    configureType,
  } = $plugin.DSL(store, 'manager');
    if(isRancherPrime()) {
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
  }