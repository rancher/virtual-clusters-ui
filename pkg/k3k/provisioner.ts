import { IClusterProvisioner, ClusterProvisionerContext } from '@shell/core/types';
import { mapDriver } from '@shell/store/plugins';
import CruK3KCluster from './components/CruK3KCluster.vue';
import { Component } from 'vue/types/umd';

type ICluster = any;

export class k3kProvisioner implements IClusterProvisioner {
  static ID = 'k3k'

  // static useForModel(cluster: ICluster) {
  //   return false;
  // }

  constructor(private context: ClusterProvisionerContext) {
    mapDriver(this.id, 'k3k' );
  }

  get id(): string {
    return k3kProvisioner.ID;
  }

  get group(): string {
    return 'virtual';
  }

  get label(): string {
    return this.context.t('k3k.label');
  }

  get component(): Component {
    return CruK3KCluster;
  }

  get detailTabs(): any {
    return {
      machines:     false,
      logs:         false,
      registration: false,
      snapshots:    false,
      related:      true,
      events:       false,
      conditions:   false,
    };
  }
}
