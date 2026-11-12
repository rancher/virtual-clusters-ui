
// Helpers for testing the "Install K3k" button (pkg/virtual-clusters/components/InstallK3k.vue).
import {
  K3K_CHART_NAME, K3K_CHART_NAMESPACE, K3K_MAX_VERSION, K3K_REPO_NAME, K3K_REPO_URL, k3kIndexCharts, k3kChartToInstall
} from '../../../pkg/virtual-clusters/utils/k3k-chart';
import { apiRequest, uninstallK3k, waitForResource, waitForResourceState } from './rancher-api';

const APP_TYPE = 'catalog.cattle.io.app';
const REPO_TYPE = 'catalog.cattle.io.clusterrepos';


const REPO_RETRIES = 40;
const NAMESPACE_DELETE_RETRIES = 120;
const DEPLOYED_RETRIES = 400;

// k3k's 1.x tags are under the last segment of the OCI repository path
export const K3K_OLDER_TAGS_KEY = K3K_REPO_URL.split('/').pop() as string;

// registry.suse.com has no charts at this path
// so we use this to simulate a k3k repo with some trouble loading its charts
export const K3K_REPO_URL_WITHOUT_CHARTS = 'oci://registry.suse.com/rancher/charts/does-not-exist';

// in the ui charts are installed by hitting a repo-specific endpoint with the 'install' action
export const K3K_INSTALL_URL = new RegExp(`/catalog\\.cattle\\.io\\.clusterrepos?/${ K3K_REPO_NAME }\\?action=install$`, 'i');

const [MAJOR, MINOR] = K3K_MAX_VERSION.split('.').map(Number);

// these MAJOR and MINOR numbers are parsed from the ui extension's packagejson
export const K3K_VERSIONS = {
  supported:      `${ MAJOR }.${ MINOR }.1`,
  olderSupported: `${ MAJOR }.${ MINOR }.0`,
  prerelease:     `${ MAJOR }.${ MINOR }.2-rc1`,
  nextMinor:      `${ MAJOR }.${ MINOR + 1 }.0`,
  nextMajor:      `${ MAJOR + 1 }.0.0`,
};

export interface IndexChart { name: string, version: string }

export interface K3kRepoStatusStub {
  // false when status.observedGeneration is behind metadata.generation, indicating that rancher has not processed the applied spec
  processed?: boolean;
  // OCIDownloaded condition: the UI waits for this to be true before proceeding with the search for a version and then installation
  downloaded?: boolean;
  message?: string;
}

export interface K3kInstallStub {
  // ClusterRepo statuses from each poll
  statuses?: K3kRepoStatusStub[];
  // chart versions under each index key
  index?: Record<string, string[]>;
}

const clusterPrefix = (clusterId: string) => `k8s/clusters/${ clusterId }/v1`;

// any app in the correct namespace counts as k3k being installed (more performant than iterating thru every single app looking for a specific chart)
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

// stub the multiple requests the Install K3k button makes: creating the repo resource, polling its status, fetching its index, and installing k3k
export function stubK3kInstallRequests(clusterId: string, { statuses = [{}], index = {} }: K3kInstallStub) {
  const repoPath = `/${ clusterPrefix(clusterId) }/${ REPO_TYPE }/${ K3K_REPO_NAME }`;
  let polls = 0;

  cy.intercept({
    method: 'POST', pathname: `/v3/clusters/${ clusterId }`, query: { action: 'importYaml' }
  }, { statusCode: 200, body: {} });

  // fetching the index and installing k3k are both done thru the clusterrepo endpoint; anchoring here lets us differentiate between those 2
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

// create the k3k ClusterRepo AND wait for its index to be retrievable
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
