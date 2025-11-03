import { COUNT, MANAGEMENT } from '@shell/config/types';
import SteveModel from '@shell/plugins/steve/steve-class';
import { colorForState } from '@shell/plugins/dashboard-store/resource-class';

import { ANNOTATIONS, LABELS, K3K } from '../types';
import { getVersionData } from '@shell/config/version';

export const getProjectIds = (policy) => {
  return (policy.metadata?.annotations?.[ANNOTATIONS.POLICY_ASSIGNED_TO] || '').split(',').map((p) => p.trim()).filter((p) => !!p);
};

export default class VirtualClusterPolicy extends SteveModel {
  get canEdit() {
    return super.canEdit && getVersionData().RancherPrime === 'true';
  }

  get canDelete() {
    return super.canDelete && getVersionData().RancherPrime === 'true';
  }

  get canClone() {
    return super.canClone && getVersionData().RancherPrime === 'true';
  }

  get canUpdate() {
    return super.canUpdate && getVersionData().RancherPrime === 'true';
  }

  get canCustomEdit() {
    return super.canCustomEdit && getVersionData().RancherPrime === 'true';
  }

  get canCreate() {
    return super.canCreate && getVersionData().RancherPrime === 'true';
  }

  get projectIds() {
    return getProjectIds(this);
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

  async fetchAssignedClusterCount() {
    const clusterCountByNamespace = this.$rootGetters['cluster/all'](COUNT)?.[0]?.counts?.[K3K.CLUSTER]?.namespaces || {};

    let count = 0;

    this.allAssignedNamespaceIds.forEach(( nsId) => {
      const nsCount = clusterCountByNamespace[nsId]?.count || 0;

      count += nsCount;
    });

    return count;
  }
}
