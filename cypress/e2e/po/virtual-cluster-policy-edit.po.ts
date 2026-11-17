import { MEDIUM_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import VirtualClustersPolicyListPagePo from './virtual-clusters-policy-list.po';
import PolicyPagePo from './policy-page.po';

export default class VirtualClusterPolicyEditPagePo extends PolicyPagePo {
  private static editPath(clusterId: string, name: string) {
    return `/c/${ clusterId }/virtualclusters/k3k.io.virtualclusterpolicy/${ name }`;
  }

  static navTo(clusterId: string, name: string): VirtualClusterPolicyEditPagePo {
    const list = new VirtualClustersPolicyListPagePo(clusterId);

    VirtualClustersPolicyListPagePo.navTo(clusterId);
    list.waitForPage();
    list.waitForList();
    list.resourceTable().sortableTable().rowActionMenuOpen(name)
      .getMenuItem('Edit Config')
      .click();

    const page = new VirtualClusterPolicyEditPagePo(clusterId, name);

    page.waitForPage();

    return page;
  }

  constructor(clusterId: string, name: string) {
    super(VirtualClusterPolicyEditPagePo.editPath(clusterId, name));
  }

  waitForPage(): Cypress.Chainable {
    return this.page.waitForPage('mode=edit', undefined, MEDIUM_TIMEOUT_OPT);
  }
}
