import ClusterManagerDetailPagePo from '@rancher/cypress/e2e/po/detail/provisioning.cattle.io.cluster/cluster-detail.po';
import TabbedPo from '@rancher/cypress/e2e/po/components/tabbed.po';

export const HCP_TAB = 'hcp';
export const RELATED_TAB = 'related';

/**
 * Provisioning cluster detail page of a virtual cluster.
 * The HCP tab is added by the extension (pkg/virtual-clusters/index.ts) for clusters annotated with hcp mode.
 */
export default class VirtualClusterDetailPagePo extends ClusterManagerDetailPagePo {
  tabs(): TabbedPo {
    return new TabbedPo();
  }

  tab(name: string): Cypress.Chainable {
    return this.self().find(`li[data-testid="${ name }"]`);
  }

  tabButton(name: string): Cypress.Chainable {
    return this.self().find(`[data-testid="btn-${ name }"]`);
  }

  hcpRegistrationTitle(): Cypress.Chainable {
    return this.self().contains('Registration command');
  }

  registrationCommand(): Cypress.Chainable {
    return this.self().find('code.registration-command');
  }

  noServerAddressWarning(): Cypress.Chainable {
    return this.self().contains('No server address reachable by external workers was found');
  }

  pendingMessage(): Cypress.Chainable {
    return this.self().contains('Waiting for the virtual cluster to provision');
  }
}
