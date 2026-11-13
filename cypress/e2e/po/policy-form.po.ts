import ComponentPo from '@rancher/cypress/e2e/po/components/component.po';
import CheckboxInputPo from '@rancher/cypress/e2e/po/components/checkbox-input.po';
import LabeledSelectPo from '@rancher/cypress/e2e/po/components/labeled-select.po';
import RadioGroupInputPo from '@rancher/cypress/e2e/po/components/radio-group-input.po';

import StorageClassSyncPo from './storage-class-sync.po';

export type K3kMode = 'shared' | 'virtual' | 'hcp';
export type NotAllowedSection = 'synchronization' | 'security' | 'isolation' | 'agentScheduling';


// pkg/virtual-clusters/edit/k3k.io.virtualclusterpolicy/index.vue
// virtual cluster policy create/edit/detail page, rednered in cluster explorer and cluster mgmt (drawer) context
export default class PolicyFormPo extends ComponentPo {
  // mode radios are selected by their order on the page - hcp is left out < 1.2.x
  static readonly MODE_INDEX: Record<K3kMode, number> = {
    shared: 0, virtual: 1, hcp: 2
  };

  static readonly SELECTOR = '[data-testid="k3k-policy-form"]';

  constructor() {
    super(PolicyFormPo.SELECTOR);
  }

  storageClassSync(): StorageClassSyncPo {
    return new StorageClassSyncPo();
  }

  // virtual, shared, or HCP mode radios
  modeRadios(): RadioGroupInputPo {
    return new RadioGroupInputPo('[data-testid="k3k-mode"]', this.self());
  }

  selectMode(mode: K3kMode): Cypress.Chainable {
    return this.modeRadios().set(PolicyFormPo.MODE_INDEX[mode]);
  }

  // needs to match entire title
  section(title: string): Cypress.Chainable {
    return this.self().contains('.rc-section > .section-header .title', new RegExp(`^\\s*${ title }\\s*$`)).closest('.rc-section');
  }

  // expand an RcSection if it is collapsed
  expandSection(title: string): Cypress.Chainable {
    return this.section(title).then(($section) => {
      const $header = $section.children('.section-header');

      if ($header.hasClass('collapsed')) {
        cy.wrap($header).click();
      }

      return cy.wrap($section);
    });
  }

  // pkg/virtual-clusters/components/Sync/NotAllowed.vue
  notAllowed(section: NotAllowedSection): Cypress.Chainable {
    return this.self().find(`[data-testid="k3k-not-allowed-${ section }"]`);
  }

  podSecuritySelect(): LabeledSelectPo {
    return new LabeledSelectPo('[data-testid="k3k-policy-pod-security"]', this.self());
  }

  isolationCheckbox(): CheckboxInputPo {
    return new CheckboxInputPo('[data-testid="k3k-policy-isolation"]', this.self());
  }

  agentScheduling(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-policy-agent-scheduling"]');
  }
}
