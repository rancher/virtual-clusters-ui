import { CATALOG } from '@shell/config/types';

export const K3K_CHART_NAME = 'suse-virtual-cluster-engine';
export const K3K_CHART_NAMESPACE = 'k3k-system';

export const K3K_REPO_NAME = 'suse-virtual-cluster-engine';
export const K3K_REPO_URL = 'oci://registry.suse.com/rancher/charts/appco-suse-virtual-cluster-engine';

/**
 * This function retrieves the count resource for the target cluster and returns true if there is at least one catalog.cattle.io.app in the k3k-system namespace
 * the function does not look for an app with a specific name as the app may have different names depending on how its was installed
 * @param {*} store vuex store ie component this.$store
 * @param {*} mgmtId id of the cluster to look for k3k in
 */
export const verifyK3kIsInstalled = async(store, mgmtId) => {
  try {
    const count = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtId }/v1/counts/count`,
      method: 'GET',
    });

    return !!count?.counts?.[CATALOG.APP]?.namespaces?.[K3K_CHART_NAMESPACE]?.count;
  } catch (err) {
    return false;
  }
};
