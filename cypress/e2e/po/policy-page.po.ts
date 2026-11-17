import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';
import NameNsDescription from '@rancher/cypress/e2e/po/components/name-ns-description.po';

import PolicyFormPo from './policy-form.po';

//  
// the policy form on its own create or edit page
// the provisioning form's drawer shows the same form in view mode, without these controls
export default abstract class PolicyPagePo extends PolicyFormPo {
  protected page: PagePo;

  constructor(path: string) {
    super();
    this.page = new PagePo(path);
  }

  nameNsDescription(): NameNsDescription {
    return new NameNsDescription(PolicyFormPo.SELECTOR);
  }

  save(): AsyncButtonPo {
    return new AsyncButtonPo('[data-testid="cluster-explorer-virtual-cluster-policy-save"]');
  }
}
