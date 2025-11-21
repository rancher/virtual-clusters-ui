import { CATALOG, NAMESPACE } from '@shell/config/types';
import { K3K } from '../types';
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

/**
 * Check whether or not the current user would be able to use the Install K3K button
 * users need permission to create a ns and add a cluster repo. Installing charts uses an imperative api so we can't just check the catalog.cattle.io.app schema methods to see if users can install apps
 * instead, we'll assume that if users can add repos they can also use their repos
 * @param {*} store vuex store ie component this.$store
 * @param {*} mgmtId id of the cluster to look for k3k in
 * @returns bool - true if user has permission to create the k3k namespace and repo; false otherwise
 */
export const verifyUserCanInstallK3k = async(store, mgmtId) => {
  try {
    const nsSchema = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtId }/v1/schemas/${ NAMESPACE }`,
      method: 'GET',
    });

    const canCreateNS = nsSchema?.collectionMethods.find((x) => x.toLowerCase() === 'post');

    if (!canCreateNS) {
      return false;
    }

    const repoSchema = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtId }/v1/schemas/${ CATALOG.CLUSTER_REPO }`,
      method: 'GET',
    });

    return !!repoSchema?.collectionMethods.find((x) => x.toLowerCase() === 'post');
  } catch {
    return false;
  }
};

/**
 *
 * @param {*} store vuex store ie component this.$store
 * @param {*} mgmtId id of the cluster to look for k3k in
 * @returns bool - true if the target cluster has k3k installed and the current user can create k3k clusters; false otherwise
 */
export const verifyUserCanCreateK3kClusters = async(store, mgmtId) => {
  try {
    const k3kClusterSchema = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtId }/v1/schemas/${ K3K.CLUSTER }`,
      method: 'GET',
    });

    return !!k3kClusterSchema?.collectionMethods.find((x) => x.toLowerCase() === 'post');
  } catch (err) {
    return false;
  }
};
