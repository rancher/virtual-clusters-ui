import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import LabeledSelectPo from '@rancher/cypress/e2e/po/components/labeled-select.po';
import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';

export default class CruK3kPo extends PagePo {
  constructor() {
    super('[data-testid="cluster-manager-virtual-cluster"]');
  }

  hostClusterSelect(): LabeledSelectPo {
    return new LabeledSelectPo('[data-testid="k3k-host-cluster-select"]', this.self());
  }

  // options are rendered from cluster display names fetched async after the
  // form loads, so match by label rather than a per-option testid
  selectHostCluster(label: string): Cypress.Chainable {
    this.hostClusterSelect().toggle();

    return this.hostClusterSelect().clickOptionWithLabel(label);
  }

  hostClusterOptionLabels(): Cypress.Chainable<string[]> {
    this.hostClusterSelect().toggle();

    return this.hostClusterSelect().getOptionsAsStrings();
  }

  installK3kButton(): AsyncButtonPo {
    return new AsyncButtonPo('[data-testid="install-k3k-button"]', this.self());
  }

  // the host cluster select's data-testid lands on the inner v-select (LabeledSelect
  // has inheritAttrs: false), but the loading spinner is a sibling of v-select under
  // the outer .labeled-select wrapper, so we have to search from there instead
  // TODO nb use dashboard LabeledSelect PO waitForLoading
  waitForHostClusterLoad(timeout = 20000): Cypress.Chainable {
    return this.hostClusterSelect().self()
      .closest('.labeled-select')
      .find('.icon-spinner', { timeout })
      .should('not.exist');
  }
}
