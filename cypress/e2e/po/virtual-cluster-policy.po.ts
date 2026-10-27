import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';
import LabeledInputPo from '@rancher/cypress/e2e/po/components/labeled-input.po';
import UnitInputPo from '@rancher/cypress/e2e/po/components/unit-input.po';
import PagePo from '@rancher/cypress/e2e/po/pages/page.po';

const PRODUCT = 'virtualclusters';
const RESOURCE = 'k3k.io.virtualclusterpolicy';

export default class VirtualClusterPolicyPo extends PagePo {
  private static createPath(clusterId: string, policyName?: string) {
    const id = policyName || 'create';

    return `/c/${ clusterId }/${ PRODUCT }/${ RESOURCE }/${ id }`;
  }

  static goToCreate(clusterId: string): Cypress.Chainable<Cypress.AUTWindow> {
    return super.goTo(VirtualClusterPolicyPo.createPath(clusterId));
  }

  static goToEdit(clusterId: string, policyName: string): Cypress.Chainable<Cypress.AUTWindow> {
    return super.goTo(VirtualClusterPolicyPo.createPath(clusterId, policyName));
  }

  constructor(clusterId: string, policyName?: string) {
    super(
      VirtualClusterPolicyPo.createPath(clusterId, policyName),
      '[data-testid="cluster-explorer-virtual-cluster-policy"]'
    );
  }

  saveButton(): AsyncButtonPo {
    return new AsyncButtonPo('[data-testid="cluster-explorer-virtual-cluster-policy-save"]', this.self());
  }

  name(): LabeledInputPo {
    return new LabeledInputPo(this.self().find('[data-testid="NameNsDescriptionNameInput"] input'));
  }

  resourceAllocationTab(): Cypress.Chainable {
    return this.self().find('[data-testid="btn-resources"]');
  }

  cpuRequest(): UnitInputPo {
    return new UnitInputPo('[data-testid="cpu-reservation"]', this.self());
  }

  cpuLimit(): UnitInputPo {
    return new UnitInputPo('[data-testid="cpu-limit"]', this.self());
  }

  errorBanner(): Cypress.Chainable {
    return this.self().find('#cru-errors');
  }
}
