import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';
import ResourceListMastheadPo from '@rancher/cypress/e2e/po/components/ResourceList/resource-list-masthead.po';
import ResourceTablePo from '@rancher/cypress/e2e/po/components/resource-table.po';
import { MEDIUM_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';
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

    productNav.navToSideMenuGroupByLabelExistence(NAV_LABEL, 'exist').then(($group) => {
      if ($group.hasClass('expanded')) {
        productNav.navToSideMenuEntryByLabel(POLICY_NAV_LABEL);
      } else {
        //
        // the group header opens the landing page, pkg/virtual-clusters/pages/index.vue
        // with k3k installed, that page replaces the route with the policy list when its requests finish, even after it is left
        // a navigation started before then, eg to the create page, is undone, so wait for the replace instead of clicking the policy entry
        cy.wrap($group).click();
      }
    });
    new VirtualClustersPolicyListPagePo(clusterId).waitForListPath();
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

  //
  // the create and edit urls start with the list url, so waitForPage also passes on those pages
  // the pathname has a /dashboard prefix when the ui is served by rancher
  waitForListPath(options = MEDIUM_TIMEOUT_OPT): Cypress.Chainable {
    return cy.location('pathname', options).should((pathname) => {
      expect(pathname.endsWith(this.path), `${ pathname } is the policy list`).to.eq(true);
    });
  }

  /** The table renders before its rows load, so settle it before asserting. */
  waitForList() {
    this.resourceTable().sortableTable().checkLoadingIndicatorNotVisible();
  }

  //
  // the row under a policy that shows its state description, eg partial assignment
  stateDescription(name: string): Cypress.Chainable {
    return this.resourceTable().sortableTable().rowElementWithName(name).next('tr.state-description');
  }
}
