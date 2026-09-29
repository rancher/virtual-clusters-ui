import BaseExtensionsPagePo from '@rancher/cypress/e2e/po/pages/extensions.po';
import RepositoriesPagePo from '@rancher/cypress/e2e/po/pages/chart-repositories.po';
import ChartRepositoriesCreateEditPo from '@rancher/cypress/e2e/po/edit/chart-repositories.po';
import LabeledInputPo from '@rancher/cypress/e2e/po/components/labeled-input.po';
import { LONG_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

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
   * Wait until the Installed tab is actually clickable.
   *
   * waitForTabs() only waits for the tab strip container; the Installed tab itself is
   * rendered later, once the list of installed plugins has come back, and it is absent
   * entirely when nothing is installed. Reaching for it too early finds a strip holding
   * only the active tab, which fails as "expected to find content 'Installed' within
   * <li.tab.active>".
   */
  waitForInstalledTab(): Cypress.Chainable {
    this.loading().should('not.exist');
    this.waitForTabs();

    return cy.get('[data-testid="btn-installed"]', LONG_TIMEOUT_OPT).should('be.visible');
  }

  /**
   * Wait until the extensions page has finished loading and its catalog is rendered.
   * waitForPage only asserts the URL, so without this every later reach for a tab or a
   * card races a page that is still coming up.
   */
  waitForCatalog(): Cypress.Chainable {
    this.loading().should('not.exist');

    return this.waitForTabs();
  }

  /**
   * Add a Helm HTTP repository through the chart repositories UI and wait for it to
   * be downloaded and Active. Navigates straight to the repositories list rather than
   * going through the Extensions kebab menu, which the upstream helper depends on.
   */
  addHelmRepository(url: string, name: string): Cypress.Chainable {
    cy.visit(APP_REPOS_PATH);

    const appRepoList = new RepositoriesPagePo('local', 'apps');

    appRepoList.waitForPage();
    // waitForPage only asserts the URL, and cy.visit is a full page load: on a loaded
    // CI node the dashboard can take well over the default 10s to render the list.
    appRepoList.list().checkVisible(LONG_TIMEOUT_OPT);
    appRepoList.create();

    const appRepoCreate = new ChartRepositoriesCreateEditPo('local', 'apps');

    appRepoCreate.waitForPage();
    // the source-type cards render after the form route resolves
    appRepoCreate.repoRcItemCard('helm-url').checkVisible(LONG_TIMEOUT_OPT);

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
