import { isRancherPrime } from '@shell/config/version';

export async function init($plugin:any, store:any) {
  const { configureType } = $plugin.DSL(store, 'manager');

  if (isRancherPrime() || true) { // eslint-disable-line no-constant-condition -- TODO nb remove
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
