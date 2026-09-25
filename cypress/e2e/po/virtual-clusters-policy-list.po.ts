import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';
import ResourceListMastheadPo from '@rancher/cypress/e2e/po/components/ResourceList/resource-list-masthead.po';
import ResourceTablePo from '@rancher/cypress/e2e/po/components/resource-table.po';
import { NAV_LABEL } from './virtual-clusters-landing.po';

// k3k.io.virtualclusterpolicy resolves to this via the extension's l10n.
export const POLICY_NAV_LABEL = 'Virtual Cluster Policies';

export default class VirtualClustersPolicyListPagePo extends PagePo {
  private static createPath(clusterId: string) {
    return `/c/${ clusterId }/virtualclusters/k3k.io.virtualclusterpolicy`;
  }

  static goTo(clusterId: string): Cypress.Chainable<Cypress.AUTWindow> {
    return super.goTo(VirtualClustersPolicyListPagePo.createPath(clusterId));
  }

  static navTo(clusterId: string) {
    ClusterDashboardPagePo.goTo(clusterId);
    new ClusterDashboardPagePo(clusterId).waitForPage();

    const productNav = new ProductNavPo();

    productNav.checkSideMenuEntryByLabel(POLICY_NAV_LABEL, 'exist');
    productNav.navToSideMenuGroupByLabel(NAV_LABEL);
  }

  constructor(clusterId: string) {
    super(VirtualClustersPolicyListPagePo.createPath(clusterId));
  }

  masthead() {
    return new ResourceListMastheadPo(this.self());
  }

  resourceTable() {
    return new ResourceTablePo(this.self());
  }

  /** The table renders before its rows load, so settle it before asserting. */
  waitForList() {
    this.resourceTable().sortableTable().checkLoadingIndicatorNotVisible();
  }
}
