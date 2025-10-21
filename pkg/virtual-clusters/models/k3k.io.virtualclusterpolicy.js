import { MANAGEMENT } from '@shell/config/types';
import SteveModel from '@shell/plugins/steve/steve-class';
import { colorForState } from '@shell/plugins/dashboard-store/resource-class';

import { ANNOTATIONS, LABELS, K3K } from '../types';

export default class VirtualClusterPolicy extends SteveModel {
  get projectIds() {
    return (this.metadata?.annotations?.[ANNOTATIONS.POLICY_ASSIGNED_TO] || '').split(',').map((p) => p.trim());
  }

  get hasPartiallyAssignedProjects() {
    for (const p of this.projectIds) {
      const storeObject = this.$rootGetters['management/byId'](MANAGEMENT.PROJECT, p);

      if (!storeObject) {
        continue;
      }
      const namespaces = storeObject.namespaces || [];

      const unAssigned = namespaces.find((ns) => ns?.metadata?.labels?.[LABELS.POLICY] !== this?.metadata?.name);

      if (!!unAssigned) {
        return true;
      }
    }

    return false;
  }

  get allAssignedNamespaceIds() {
    return this.projectIds.reduce((allNs, p) => {
      const storeObject = this.$rootGetters['management/byId'](MANAGEMENT.PROJECT, p);

      const namespaces = storeObject?.namespaces || [];

      allNs.push(...namespaces.map((ns) => ns.id));

      return allNs;
    }, []);
  }

  get stateDescription() {
    return this.hasPartiallyAssignedProjects ? this.t('k3k.policy.listView.hasPartiallyAssigned') : super.stateDescription;
  }

  get stateObj() {
    const defaultStateObj = super.stateObj;

    return { ...defaultStateObj, error: this.hasPartiallyAssignedProjects || defaultStateObj?.error };
  }

  get stateColor() {
    return colorForState.call(
      this,
      this.state,
      super.stateObj?.error, // don't want to use a red background on the state badge just because the policy has partially assigned projects
      this.stateObj?.transitioning
    );
  }

  async findAssignedClusters() {
    // TODO nb can't query for large #'s of namespaces at once - need to refactor if we stick with this promptRemove approach
    if (this.allAssignedNamespaceIds?.length && this.allAssignedNamespaceIds?.length < 20 ) {
      const clusters = await this.$dispatch('cluster/findAll', { type: K3K.CLUSTER, opt: { namespaced: this.allAssignedNamespaceIds } }, { root: true });

      return clusters || [];
    } else {
      return [];
    }
  }
}
