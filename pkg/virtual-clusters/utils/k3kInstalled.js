import semver from 'semver';
import { CATALOG, NAMESPACE } from '@shell/config/types';
import { K3K } from '../types';
import pkgjson from '../package.json';

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

/**
 * Compare the virtual clusters ui extension version to the k3k app version
 * @returns bool | null - true if major/minor versions match; false if they do not; null if one or both versions can't be read (eg user lacks permission to see k3k app)
 */
export const verifyK3kVersionMatches = async(store, mgmtId) => {
  try {
    const extensionVersion = pkgjson?.version;

    const appSchema = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtId }/v1/schemas/${ CATALOG.APP }`,
      method: 'GET',
    });

    if (!appSchema || !(appSchema.resourceMethods || []).includes('GET')) {
      return null;
    }

    const k3kApp = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtId }/v1/${ CATALOG.APP }s/${ K3K_CHART_NAMESPACE }/${ K3K_CHART_NAME }`,
      method: 'GET'
    });

    const k3kVersion = k3kApp?.spec?.chart?.metadata?.appVersion;

    if (!k3kApp || !k3kVersion) {
      return null;
    }

    const coercedExtensionVersion = semver.coerce(extensionVersion);
    const coercedK3kVersion = semver.coerce(k3kVersion);

    return semver.major(coercedK3kVersion) === semver.major(coercedExtensionVersion) && semver.minor(coercedK3kVersion) === semver.minor(coercedExtensionVersion);
  } catch (e) {
    return null;
  }
};

/** Check the schemaDefinition for a given type and return true if the specified field is found.
 * Throws an error if the schema cannot be found
 * @param {*} store vuex store ie component this.$store
 * @param {*} mgmtId string id of the cluster to look for k3k in
 * @param {*} type string k8s resource type to look for field in
 * @param {*} field string field to look for in the schema definition, Can be a dot path eg 'spec.sync.configMaps'
 */
export const fieldIsSupported = async(store, mgmtId, type, field) => {
  const schemaDefinition = await store.dispatch('management/request', {
    url:    `/k8s/clusters/${ mgmtId }/v1/schemaDefinitions/${ type }`,
    method: 'GET',
  });

  const { definitionType } = schemaDefinition;

  const definitionPaths = Object.keys(schemaDefinition?.definitions || {});

  return definitionPaths.includes(`${ definitionType }.${ field }`);
};
