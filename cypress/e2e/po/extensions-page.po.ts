import BaseExtensionsPagePo from '@rancher/cypress/e2e/po/pages/extensions.po';
import RepositoriesPagePo from '@rancher/cypress/e2e/po/pages/chart-repositories.po';
import ChartRepositoriesCreateEditPo from '@rancher/cypress/e2e/po/edit/chart-repositories.po';
import LabeledInputPo from '@rancher/cypress/e2e/po/components/labeled-input.po';

import { waitForRepositoryDownload, waitForResourceState } from '../utils/rancher-api';

const CLUSTER_REPOS_BASE_URL = '/v1/catalog.cattle.io.clusterrepos';
const APP_REPOS_PATH = '/c/local/apps/catalog.cattle.io.clusterrepo';

/**
 * The upstream ExtensionsPagePo only knows how to add Git-backed extension
 * repositories (addExtensionsRepository). The virtual-clusters chart is published
 * as a plain Helm HTTP repository on gh-pages, so add support for that here.
 */
export default class ExtensionsPagePo extends BaseExtensionsPagePo {
  /**
   * Add a Helm HTTP repository through the chart repositories UI and wait for it to
   * be downloaded and Active. Navigates straight to the repositories list rather than
   * going through the Extensions kebab menu, which the upstream helper depends on.
   */
  addHelmRepository(url: string, name: string): Cypress.Chainable {
    cy.visit(APP_REPOS_PATH);

    const appRepoList = new RepositoriesPagePo('local', 'apps');

    appRepoList.waitForPage();
    appRepoList.list().checkVisible();
    appRepoList.create();

    const appRepoCreate = new ChartRepositoriesCreateEditPo('local', 'apps');

    appRepoCreate.waitForPage();

    // fill the form
    appRepoCreate.selectHelmUrlCard();
    appRepoCreate.nameNsDescription().name().self().scrollIntoView()
      .should('be.visible');
    appRepoCreate.nameNsDescription().name().set(name);
    // the upstream PO has no accessor for the Helm URL input, only Git/OCI ones
    new LabeledInputPo('[data-testid="clusterrepo-helm-url-input"]').set(url);

    // save it
    appRepoCreate.saveAndWaitForRequests('POST', CLUSTER_REPOS_BASE_URL);

    // Assert readiness over the API rather than the repositories list: saving does not
    // reliably land back on the list, and the chart index has to be downloaded before
    // the extension can be installed from it anyway. These use our own helpers rather
    // than cy.waitForRepositoryDownload / cy.waitForResourceState - see
    // cypress/e2e/utils/rancher-api.ts for why.
    return waitForRepositoryDownload(name).then((downloaded) => {
      expect(downloaded, `chart repository '${ name }' was not downloaded`).to.eq(true);

      return waitForResourceState('v1', 'catalog.cattle.io.clusterrepos', name).then((active) => {
        expect(active, `chart repository '${ name }' did not become active`).to.eq(true);
      });
    });
  }
}
