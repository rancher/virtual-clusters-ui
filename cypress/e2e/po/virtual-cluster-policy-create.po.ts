import { MEDIUM_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import VirtualClustersPolicyListPagePo from './virtual-clusters-policy-list.po';
import PolicyPagePo from './policy-page.po';


export default class VirtualClusterPolicyCreatePagePo extends PolicyPagePo {
  private static createPath(clusterId: string) {
    return `/c/${ clusterId }/virtualclusters/k3k.io.virtualclusterpolicy/create`;
  }

  static navTo(clusterId: string): VirtualClusterPolicyCreatePagePo {
    const list = new VirtualClustersPolicyListPagePo(clusterId);

    VirtualClustersPolicyListPagePo.navTo(clusterId);
    list.waitForPage();
    list.waitForList();
    list.masthead().create();

    const page = new VirtualClusterPolicyCreatePagePo(clusterId);

    page.waitForPage();

    return page;
  }

  constructor(clusterId: string) {
    super(VirtualClusterPolicyCreatePagePo.createPath(clusterId));
  }

  // waits for the create page to be fully loaded, including any route guards and API requests
  waitForPage(): Cypress.Chainable {
    return this.page.waitForPage(undefined, undefined, MEDIUM_TIMEOUT_OPT);
  }
}
