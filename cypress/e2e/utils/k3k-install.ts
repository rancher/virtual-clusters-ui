/**
 * Helpers for tests of the Install K3k button (pkg/virtual-clusters/components/InstallK3k.vue).
 * The stub helpers answer the button's requests in the browser, so nothing is created or installed.
 * The other helpers set up real k3k and ClusterRepo state in a host cluster.
 */
import {
  K3K_CHART_NAME, K3K_CHART_NAMESPACE, K3K_MAX_VERSION, K3K_REPO_NAME, K3K_REPO_URL, k3kIndexCharts, k3kChartToInstall
} from '../../../pkg/virtual-clusters/utils/k3k-chart';
import { apiRequest, uninstallK3k, waitForResource, waitForResourceState } from './rancher-api';

const APP_TYPE = 'catalog.cattle.io.app';
const REPO_TYPE = 'catalog.cattle.io.clusterrepos';

// polls run every 1.5s
const REPO_RETRIES = 40;
const NAMESPACE_DELETE_RETRIES = 120;
// the install runs helm with wait and a 600s timeout
const DEPLOYED_RETRIES = 400;

// rancher indexes the newest oci tag under the chart name
// and older tags under the last segment of the oci repository path
export const K3K_OLDER_TAGS_KEY = K3K_REPO_URL.split('/').pop() as string;

// registry.suse.com has no charts at this path, so rancher processes the repo but does not download it
export const K3K_REPO_URL_WITHOUT_CHARTS = 'oci://registry.suse.com/rancher/charts/does-not-exist';

// InstallK3k.vue sends the install action to catalog.cattle.io.ClusterRepo
export const K3K_INSTALL_URL = new RegExp(`/catalog\\.cattle\\.io\\.clusterrepos?/${ K3K_REPO_NAME }\\?action=install$`, 'i');

const [MAJOR, MINOR] = K3K_MAX_VERSION.split('.').map(Number);

/** Chart versions relative to K3K_MAX_VERSION, the newest k3k minor this extension version supports. */
export const K3K_VERSIONS = {
  supported:      `${ MAJOR }.${ MINOR }.1`,
  olderSupported: `${ MAJOR }.${ MINOR }.0`,
  prerelease:     `${ MAJOR }.${ MINOR }.2-rc1`,
  nextMinor:      `${ MAJOR }.${ MINOR + 1 }.0`,
  nextMajor:      `${ MAJOR + 1 }.0.0`,
};

export interface IndexChart { name: string, version: string }

export interface K3kRepoStatusStub {
  // false: status.observedGeneration is behind metadata.generation, ie rancher has not processed the applied spec
  processed?: boolean;
  // status of the OCIDownloaded condition
  downloaded?: boolean;
  message?: string;
}

export interface K3kInstallStub {
  // ClusterRepo status returned by each poll; the last one repeats
  statuses?: K3kRepoStatusStub[];
  // chart versions under each index key
  index?: Record<string, string[]>;
}

const clusterPrefix = (clusterId: string) => `k8s/clusters/${ clusterId }/v1`;

/**
 * Report whether k3k is installed in a cluster, whatever is installed there.
 * The extension counts any app in the k3k namespace (pkg/virtual-clusters/utils/k3kInstalled.js).
 */
export function stubK3kInstalled(clusterId: string, installed: boolean) {
  cy.intercept({ method: 'GET', pathname: `/${ clusterPrefix(clusterId) }/counts/count` }, (req) => {
    req.continue((res) => {
      const counts = res.body?.counts || {};
      const apps = counts[APP_TYPE] || { summary: { count: 0 }, namespaces: {} };
      const namespaces = { ...apps.namespaces };

      if (installed) {
        namespaces[K3K_CHART_NAMESPACE] = { count: 1 };
      } else {
        delete namespaces[K3K_CHART_NAMESPACE];
      }

      res.body = { ...res.body, counts: { ...counts, [APP_TYPE]: { ...apps, namespaces } } };
    });
  });
}

/**
 * Answer every request the Install K3k button makes.
 * Aliases: @k3kRepo for each ClusterRepo poll, @k3kIndex, @k3kInstall.
 */
export function stubK3kInstallRequests(clusterId: string, { statuses = [{}], index = {} }: K3kInstallStub) {
  const repoPath = `/${ clusterPrefix(clusterId) }/${ REPO_TYPE }/${ K3K_REPO_NAME }`;
  let polls = 0;

  cy.intercept({
    method: 'POST', pathname: `/v3/clusters/${ clusterId }`, query: { action: 'importYaml' }
  }, { statusCode: 200, body: {} });

  // anchored at the end so the index link and the install action do not match
  cy.intercept({ method: 'GET', url: new RegExp(`/${ clusterPrefix(clusterId) }/catalog\\.cattle\\.io\\.clusterrepos?/${ K3K_REPO_NAME }$`, 'i') }, (req) => {
    const { processed = true, downloaded = true, message = '' } = statuses[Math.min(polls, statuses.length - 1)];

    polls++;
    req.reply({
      statusCode: 200,
      body:       {
        id:       K3K_REPO_NAME,
        type:     'catalog.cattle.io.clusterrepo',
        links:    { index: `${ repoPath }?link=index` },
        metadata: { name: K3K_REPO_NAME, generation: 2 },
        spec:     { url: K3K_REPO_URL },
        status:   {
          observedGeneration: processed ? 2 : 1,
          conditions:         [{
            type: 'OCIDownloaded', status: downloaded ? 'True' : 'False', message
          }],
        },
      },
    });
  }).as('k3kRepo');

  cy.intercept({
    method: 'GET', pathname: repoPath, query: { link: 'index' }
  }, {
    statusCode: 200,
    body:       {
      apiVersion: 'v1',
      entries:    Object.fromEntries(Object.entries(index).map(([name, versions]) => [name, versions.map((version) => ({
        name, version, urls: []
      }))])),
    },
  }).as('k3kIndex');

  cy.intercept({ method: 'POST', url: K3K_INSTALL_URL }, {
    statusCode: 201,
    body:       {
      type: 'chartActionOutput', operationName: 'stub', operationNamespace: 'cattle-system'
    },
  }).as('k3kInstall');
}

/** Remove k3k and its ClusterRepo from a cluster, and wait until both are gone. */
export function removeK3k(clusterId: string) {
  const prefix = clusterPrefix(clusterId);

  uninstallK3k(clusterId);

  waitForResource(prefix, 'namespaces', K3K_CHART_NAMESPACE, (resp) => resp.status === 404, NAMESPACE_DELETE_RETRIES).then((gone) => {
    expect(gone, `${ K3K_CHART_NAMESPACE } namespace deleted`).to.eq(true);
  });
  waitForResource(prefix, REPO_TYPE, K3K_REPO_NAME, (resp) => resp.status === 404, REPO_RETRIES).then((gone) => {
    expect(gone, `${ K3K_REPO_NAME } cluster repo deleted`).to.eq(true);
  });
}

/**
 * Create the k3k ClusterRepo and wait for rancher to process it.
 * @returns the status of its OCIDownloaded condition
 */
export function createK3kRepo(clusterId: string, url = K3K_REPO_URL): Cypress.Chainable<string> {
  const prefix = clusterPrefix(clusterId);

  apiRequest({
    method: 'POST',
    url:    `/${ prefix }/${ REPO_TYPE }`,
    body:   {
      type: 'catalog.cattle.io.clusterrepo', metadata: { name: K3K_REPO_NAME }, spec: { url, insecurePlainHttp: false }
    },
  }).its('status').should('eq', 201);

  waitForResource(prefix, REPO_TYPE, K3K_REPO_NAME, (resp) => {
    const processed = resp.body?.status?.observedGeneration === resp.body?.metadata?.generation;

    return processed && (resp.body?.status?.conditions || []).some((c: { type: string }) => c.type === 'OCIDownloaded');
  }, REPO_RETRIES).then((processed) => {
    expect(processed, `${ K3K_REPO_NAME } cluster repo processed`).to.eq(true);
  });

  return apiRequest({ url: `/${ prefix }/${ REPO_TYPE }/${ K3K_REPO_NAME }` })
    .then((resp) => resp.body.status.conditions.find((c: { type: string }) => c.type === 'OCIDownloaded').status as string);
}

/** The index entry the Install K3k button picks from the cluster's k3k repo index. */
export function k3kChartFromIndex(clusterId: string): Cypress.Chainable<IndexChart | null> {
  return apiRequest({ url: `/${ clusterPrefix(clusterId) }/${ REPO_TYPE }/${ K3K_REPO_NAME }` })
    .then((repoResp) => cy.request({ url: repoResp.body.links.index, headers: { Accept: 'application/json' } }))
    // wrapped: a null returned from .then would yield the previous subject instead
    .then((indexResp) => cy.wrap(k3kChartToInstall(k3kIndexCharts(indexResp.body)) as IndexChart | null, { log: false }));
}

export function waitForK3kDeployed(clusterId: string) {
  waitForResourceState(clusterPrefix(clusterId), `${ APP_TYPE }s/${ K3K_CHART_NAMESPACE }`, K3K_CHART_NAME, 'deployed', DEPLOYED_RETRIES).then((deployed) => {
    expect(deployed, 'k3k app deployed').to.eq(true);
  });
}
