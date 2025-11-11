import {STATE, NAME as NAME_COL, AGE} from '@shell/config/table-headers'
import { K3K } from "../types";
import { isRancherPrime } from '@shell/config/version';

export const  NAME = 'virtualclusters'

export async function init($plugin:any, store:any) {
  const {
    product,
    configureType,
    virtualType,
    basicType,
    headers
  } = $plugin.DSL(store, NAME);

    if(isRancherPrime()){
        product({
          inStore:             'cluster',
          inExplorer:          true,
          icon:                'k3k',
          removeable:          false,
          showNamespaceFilter: true,
        });

        virtualType({
          labelKey:       'product.virtualclusters',
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

        headers(K3K.POLICY, [
          STATE,
          NAME_COL,
          {
            name:          'vcmode',
            labelKey:      'k3k.policy.listView.modeHeader',
            sort:          ['spec.allowedMode'],
            value:         'spec.allowedMode',
          },
              {
            name:          'vcmode',
            labelKey:      'k3k.policy.listView.projectHeader',
            formatter:     'PolicyAssignment'
          },
          AGE
        ])
    } else {
      configureType(K3K.POLICY, {isCreatable: false, isEditable: false, isRemovable: false, canYaml:false})
    }
  }