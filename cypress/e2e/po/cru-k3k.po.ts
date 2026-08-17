import PagePo from '@rancher/cypress/e2e/po/pages/page.po';
import ClusterManagerCreatePagePo from '@rancher/cypress/e2e/po/edit/provisioning.cattle.io.cluster/create/cluster-create.po';
import LabeledSelectPo from '@rancher/cypress/e2e/po/components/labeled-select.po';
import AsyncButtonPo from '@rancher/cypress/e2e/po/components/async-button.po';

export default class CruK3kPo extends PagePo {
  constructor() {
    super('[data-testid="cluster-manager-virtual-cluster"]');
  }

  // k3kProvisioner.ID (pkg/virtual-clusters/provisioner.ts)
  static readonly SUB_TYPE = 'k3k';

  static goToCreate(clusterId = '_'): CruK3kPo {
    ClusterManagerCreatePagePo.goTo(clusterId, `type=${ CruK3kPo.SUB_TYPE }`);

    return new CruK3kPo();
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

  policySelect(): LabeledSelectPo {
    return new LabeledSelectPo('[data-testid="k3k-policy-select"]', this.self());
  }

  policyOptionLabels(): Cypress.Chainable<string[]> {
    this.policySelect().toggle();

    return this.policySelect().getOptionsAsStrings();
  }

  selectPolicy(label: string): Cypress.Chainable {
    this.policySelect().toggle();

    return this.policySelect().clickOptionWithLabel(label);
  }

  viewPolicyButton(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-policy-open-drawer"]');
  }

  targetNamespaceSelect(): LabeledSelectPo {
    return new LabeledSelectPo('[data-testid="k3k-target-namespace"]', this.self());
  }

  modeOption(mode: 'shared' | 'virtual' | 'hcp'): Cypress.Chainable {
    return this.self().find(`input[name="k3k-cluster-mode"][value="${ mode }"]`).closest('label.radio-container');
  }

  modeSection(): Cypress.Chainable {
    return this.self().find('[role="radiogroup"][aria-label="Virtual cluster mode"]');
  }

  // CruResource puts the cru__toc class on TableOfContents' root element
  tableOfContents(): Cypress.Chainable {
    return this.self().find('.cru__toc');
  }

  tocEntry(label: string): Cypress.Chainable {
    return this.tableOfContents().contains('.toc-parent-link, .toc-child-link', label);
  }

  tocTopLevelLabels(): Cypress.Chainable<string[]> {
    return this.tableOfContents().find('.toc-container > ul > li > .toc-parent-link')
      .then(($els) => Cypress.$.makeArray($els).map((el) => el.textContent?.trim() || ''));
  }

  // the host cluster select's data-testid lands on the inner v-select (LabeledSelect
  // has inheritAttrs: false), but the loading spinner is a sibling of v-select under
  // the outer .labeled-select wrapper, so we have to search from there instead
  // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
  waitForHostClusterLoad(timeout = 20000): Cypress.Chainable {
    return this.hostClusterSelect().self()
      .closest('.labeled-select')
      .find('.icon-spinner', { timeout })
      .should('not.exist');
  }

  // same spinner placement as the host cluster select
  waitForPolicyLoad(timeout = 20000): Cypress.Chainable {
    return this.policySelect().self()
      .closest('.labeled-select')
      .find('.icon-spinner', { timeout })
      .should('not.exist');
  }
}
