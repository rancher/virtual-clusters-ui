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
          tooltipKey: 'resourceTable.groupBy.none',
          icon:       'icon-list-flat',
          value:      'none',
        },      
        {
          icon:          'icon-folder',
          field:         'groupByParent',
          value:         'groupByParent',
          groupLabelKey: 'groupByLabel',
          tooltipKey:    'k3k.hostCluster.label'
        }
      ],
      listGroupsWillOverride: true,
    });
  }