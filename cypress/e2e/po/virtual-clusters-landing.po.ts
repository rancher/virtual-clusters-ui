import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';
import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';

export const NAV_LABEL = 'Virtual Clusters';

// extenion's landing page: this is automatically redirected to the virtual cluster policy list once k3k is installed
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

    productNav.navToSideMenuGroupByLabelExistence(NAV_LABEL, 'exist');
    productNav.navToSideMenuGroupByLabel(NAV_LABEL);
  }

  constructor(clusterId: string) {
    super(VirtualClustersLandingPagePo.createPath(clusterId));
  }

  title(): Cypress.Chainable {
    return this.self().contains('h2', 'Virtual Clusters');
  }

  installK3kButton(): AsyncButtonPo {
    return new AsyncButtonPo('[data-testid="install-k3k-button"]', this.self());
  }

  installSucceeded(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-install-succeeded"]');
  }

  versionsTooHighBanner(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-versions-too-high-banner"]');
  }

  notice(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-landing-notice"]');
  }

  noticeLink(): Cypress.Chainable {
    return this.notice().find('[data-testid="k3k-landing-notice-link"]');
  }

  quickGuideSteps(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-landing-quick-guide-step"]');
  }
}
