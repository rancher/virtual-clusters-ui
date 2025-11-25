import { isRancherPrime } from '@shell/config/version';
import versions from '@shell/utils/versions';

const communityBuild = process.env.VUE_APP_COMMUNITY

export async function init($plugin:any, store:any) {
  const {
    configureType,
  } = $plugin.DSL(store, 'manager');
    await versions.fetch({ store: store });
console.log('****** ', process.env)
    if(isRancherPrime() || communityBuild){
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