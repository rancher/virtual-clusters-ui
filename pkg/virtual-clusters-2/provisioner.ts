import { IClusterProvisioner, ClusterProvisionerContext } from '@shell/core/types';
import { mapDriver } from '@shell/store/plugins';
import CruK3KCluster from './components/CruK3KCluster/index.vue';
import { isRancherPrime } from '@shell/config/version';


export class k3kProvisioner implements IClusterProvisioner {
  static ID = 'k3k'

  constructor(private context: ClusterProvisionerContext) {
    mapDriver(this.id, 'k3k' );
  }

  get icon(): any {
    return require('./assets/icon-k3k.svg');
  }

  get id(): string {
    return k3kProvisioner.ID;
  }

  get group(): string {
    return this.context.t('k3k.group');
  }

  get label(): string {
    return this.context.t('k3k.label');
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

  get hidden(){
    return !isRancherPrime()
  }
}
