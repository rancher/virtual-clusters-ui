import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';
import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';

export const NAV_LABEL = 'Virtual Clusters';

/**
 * The extension's landing page, registered by the `virtualclusters` explorer
 * product (see pkg/virtual-clusters/routes.js and config/k3k-explorer-product.ts).
 */
export default class VirtualClustersLandingPagePo extends PagePo {
  private static createPath(clusterId: string) {
    return `/c/${ clusterId }/virtualclusters`;
  }

  static goTo(clusterId: string): Cypress.Chainable<Cypress.AUTWindow> {
    return super.goTo(VirtualClustersLandingPagePo.createPath(clusterId));
  }

  static navTo(clusterId: string) {
    ClusterDashboardPagePo.goTo(clusterId);
    new ClusterDashboardPagePo(clusterId).waitForPage();

    const productNav = new ProductNavPo();

    // NAV_LABEL is set to 'Virtual Clusters'
    productNav.navToSideMenuGroupByLabelExistence(NAV_LABEL, 'exist');
    productNav.navToSideMenuGroupByLabel(NAV_LABEL);
  }

  constructor(clusterId: string) {
    super(VirtualClustersLandingPagePo.createPath(clusterId));
  }

  // pages/index.vue renders the title in a plain <h2> with no test id
  title(): Cypress.Chainable {
    return this.self().contains('h2', 'Virtual Clusters');
  }

  installK3kButton(): AsyncButtonPo {
    return new AsyncButtonPo('[data-testid="install-k3k-button"]', this.self());
  }

  k3kSuccessMessageVisible(): Cypress.Chainable {
    return this.self().contains('K3K installed');
  }
}
