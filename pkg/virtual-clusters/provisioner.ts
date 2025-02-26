import { IClusterProvisioner, ClusterProvisionerContext } from '@shell/core/types';
// import { mapDriver } from '@rancher/shell/store/plugins';
import CruK3KCluster from './components/CruK3KCluster.vue';


export class k3kProvisioner implements IClusterProvisioner {
  static ID = 'k3k'

  // static useForModel(cluster: ICluster) {
  //   return false;
  // }

  // constructor(private context: ClusterProvisionerContext) {
  //   mapDriver(this.id, 'k3k' );
  // }

  get icon(): any {
    return require('./assets/icon-virtual-clusters.svg');
  }

  get id(): string {
    return k3kProvisioner.ID;
  }

  get group(): string {
    return 'Virtual';
  }

  get label(): string {
    // return this.context.t('k3k.label');
    return 'K3K'
  }

  get component(): any {
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

  get showImport(){
    return false
  }
}
