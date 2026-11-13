import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';
import NameNsDescription from '@rancher/cypress/e2e/po/components/name-ns-description.po';
import { MEDIUM_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import VirtualClustersPolicyListPagePo from './virtual-clusters-policy-list.po';
import PolicyFormPo from './policy-form.po';


export default class VirtualClusterPolicyCreatePagePo extends PolicyFormPo {
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

  private page: PagePo;

  constructor(clusterId: string) {
    super();
    this.page = new PagePo(VirtualClusterPolicyCreatePagePo.createPath(clusterId));
  }

  // waits for the create page to be fully loaded, including any route guards and API requests
  waitForPage(): Cypress.Chainable {
    return this.page.waitForPage(undefined, undefined, MEDIUM_TIMEOUT_OPT);
  }

  nameNsDescription(): NameNsDescription {
    return new NameNsDescription(PolicyFormPo.SELECTOR);
  }


  save(): AsyncButtonPo {
    return new AsyncButtonPo('[data-testid="cluster-explorer-virtual-cluster-policy-save"]');
  }
}
