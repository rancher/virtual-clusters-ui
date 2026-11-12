import {
  K3K_CHART_NAME, K3K_CHART_NAMESPACE, K3K_MAX_VERSION, K3K_REPO_NAME, K3K_REPO_URL, K3K_VALUES, k3kIndexCharts, k3kChartToInstall
} from '../../../pkg/virtual-clusters/utils/k3k-chart';
import {
  apiRequest, waitForResource, waitForResourceState, waitForSchema, K3K_POLICY_TYPE
} from '../../e2e/utils/rancher-api';

const APP_TYPE = 'catalog.cattle.io.app';
const REPO_TYPE = 'catalog.cattle.io.clusterrepos';

// polls run every 1.5s
const REPO_DOWNLOAD_RETRIES = 40;
// the install runs helm with wait and a 600s timeout
const DEPLOYED_RETRIES = 400;
const INSTALL_MAX_TRIES = 3;

/**
 * Same check as verifyK3kIsInstalled in pkg/virtual-clusters/utils/k3kInstalled.js:
 * any app in k3k-system counts, whatever its name.
 */
function k3kIsInstalled(clusterId: string): Cypress.Chainable<boolean> {
  return apiRequest({ url: `/k8s/clusters/${ clusterId }/v1/counts/count` })
    .then((resp) => !!resp.body?.counts?.[APP_TYPE]?.namespaces?.[K3K_CHART_NAMESPACE]?.count);
}

/** A 409 means the repo is left over from an earlier install, which is fine to reuse. */
function addK3kRepo(prefix: string) {
  return apiRequest({
    method: 'POST',
    url:    `/${ prefix }/${ REPO_TYPE }`,
    body:   {
      type:     'catalog.cattle.io.clusterrepo',
      metadata: { name: K3K_REPO_NAME },
      spec:     { url: K3K_REPO_URL, insecurePlainHttp: false },
    },
    failOnStatusCode: false,
  }).then((resp) => {
    expect(resp.status, 'create k3k cluster repo').to.be.oneOf([201, 409]);
  });
}

interface IndexChart { name: string, version: string }

/**
 * chart version to install, as the Install K3k button picks it.
 * @param version exact version; defaults to the newest in the repo index at or below the extension's major.minor
 */
function k3kChart(prefix: string, version?: string): Cypress.Chainable<IndexChart> {
  return apiRequest({ url: `/${ prefix }/${ REPO_TYPE }/${ K3K_REPO_NAME }` })
    .then((repoResp) => cy.request({ url: repoResp.body.links.index, headers: { Accept: 'application/json' } }))
    .then((indexResp) => {
      const charts = k3kIndexCharts(indexResp.body) as IndexChart[];
      const chart = k3kChartToInstall(charts, version) as IndexChart | null;

      expect(chart, `${ K3K_CHART_NAME } ${ version || `<= ${ K3K_MAX_VERSION }` } in the ${ K3K_REPO_NAME } index (${ charts.map((c) => c.version).join(', ') })`).to.be.an('object');

      return chart as IndexChart;
    });
}

/** Retried because the install action can fail for a short time after the repo reports downloaded. */
function requestInstall(prefix: string, body: object, remaining = INSTALL_MAX_TRIES): Cypress.Chainable<number> {
  return apiRequest({
    method:           'POST',
    url:              `/${ prefix }/${ REPO_TYPE }/${ K3K_REPO_NAME }?action=install`,
    body,
    failOnStatusCode: false,
  }).then((resp) => {
    if (resp.status === 201 || remaining <= 1) {
      expect(resp.status, 'k3k install request').to.eq(201);

      return cy.wrap(resp.status, { log: false });
    }
    cy.wait(1500); // eslint-disable-line cypress/no-unnecessary-waiting

    return requestInstall(prefix, body, remaining - 1);
  });
}

/**
 * Install k3k into a host cluster the same way the extension's Install K3k button does
 * (pkg/virtual-clusters/components/InstallK3k.vue), then wait for the chart to deploy
 * and the k3k CRDs to be served. Does nothing if k3k-system already has an app.
 *
 * @param clusterId management id of the host cluster (c-m-xxxxxxxx)
 * @param version chart version; defaults to the newest in the repo at or below K3K_MAX_VERSION
 */
Cypress.Commands.add('installK3k', (clusterId: string, version?: string) => {
  const prefix = `k8s/clusters/${ clusterId }/v1`;

  k3kIsInstalled(clusterId).then((installed) => {
    if (installed) {
      cy.log(`k3k is already installed in ${ clusterId }`);

      return;
    }

    addK3kRepo(prefix);

    waitForResource(prefix, REPO_TYPE, K3K_REPO_NAME, (resp) => {
      const conditions: { type: string, status: string }[] = resp.body?.status?.conditions || [];

      return conditions.some((c) => c.type === 'OCIDownloaded' && c.status === 'True');
    }, REPO_DOWNLOAD_RETRIES).then((downloaded) => {
      expect(downloaded, 'k3k cluster repo downloaded').to.eq(true);
    });

    k3kChart(prefix, version).then((chart) => {
      requestInstall(prefix, {
        charts: [{
          annotations: {
            'catalog.cattle.io/ui-source-repo':      K3K_REPO_NAME,
            'catalog.cattle.io/ui-source-repo-type': 'cluster'
          },
          chartName:   chart.name,
          releaseName: K3K_CHART_NAME,
          version:     chart.version,
          values:      K3K_VALUES
        }],
        disableOpenAPIValidation: false,
        namespace:                K3K_CHART_NAMESPACE,
        noHooks:                  false,
        skipCRDs:                 false,
        timeout:                  '600s',
        wait:                     true
      });
    });

    waitForResourceState(prefix, `${ APP_TYPE }s/${ K3K_CHART_NAMESPACE }`, K3K_CHART_NAME, 'deployed', DEPLOYED_RETRIES).then((deployed) => {
      expect(deployed, 'k3k app deployed').to.eq(true);
    });
    waitForSchema(clusterId, K3K_POLICY_TYPE, DEPLOYED_RETRIES).then((served) => {
      expect(served, `${ K3K_POLICY_TYPE } schema served`).to.eq(true);
    });
  });
});
