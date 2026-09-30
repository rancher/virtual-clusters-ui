import PagePo from '@rancher/cypress/e2e/po/pages/page.po';

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

  constructor(clusterId: string) {
    super(VirtualClustersLandingPagePo.createPath(clusterId));
  }

  // pages/index.vue renders the title in a plain <h2> with no test id
  title(): Cypress.Chainable {
    return this.self().contains('h2', 'Virtual Clusters');
  }
}
