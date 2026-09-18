import BaseExtensionsPagePo from '@rancher/cypress/e2e/po/pages/extensions.po';
import RepositoriesPagePo from '@rancher/cypress/e2e/po/pages/chart-repositories.po';
import ChartRepositoriesCreateEditPo from '@rancher/cypress/e2e/po/edit/chart-repositories.po';
import LabeledInputPo from '@rancher/cypress/e2e/po/components/labeled-input.po';

const CLUSTER_REPOS_BASE_URL = '/v1/catalog.cattle.io.clusterrepos';

/**
 * The upstream ExtensionsPagePo only knows how to add Git-backed extension
 * repositories (addExtensionsRepository). The virtual-clusters chart is published
 * as a plain Helm HTTP repository on gh-pages, so add support for that here.
 */
export default class ExtensionsPagePo extends BaseExtensionsPagePo {
  /**
   * Add a Helm HTTP repository through the Extensions > Manage Repositories UI
   * and wait for it to be downloaded and Active.
   */
  addHelmRepository(url: string, name: string): Cypress.Chainable {
    cy.intercept('GET', `${ CLUSTER_REPOS_BASE_URL }?*`).as('getRepos');

    // we should be on the extensions page
    this.waitForPage(null, 'available');
    this.loading().should('not.exist');

    // go to app repos
    this.extensionMenuToggle();
    this.manageReposClick();
    cy.wait('@getRepos').its('response.statusCode').should('eq', 200);

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

    appRepoList.waitForPage();
    cy.waitForRepositoryDownload('v1', 'catalog.cattle.io.clusterrepos', name);
    cy.waitForResourceState('v1', 'catalog.cattle.io.clusterrepos', name);
    appRepoList.list().state(name).should('contain', 'Active');

    return cy.wrap(appRepoList.list());
  }
}
