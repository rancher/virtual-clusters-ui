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

  // k3k.policy.noneOption
  static readonly NO_POLICY = 'No policy';

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

  installSucceeded(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-install-succeeded"]');
  }

  versionsTooHighBanner(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-versions-too-high-banner"]');
  }

  errorBanner(options?: Partial<Cypress.Timeoutable>): Cypress.Chainable {
    return this.self().find('#cru-errors [data-testid^="error-banner"]', options);
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

  // host cluster and policy will be preselected if defined, and that changes the rest of the form
  // ensuring no policy is set makes tests more independent of the host cluster's state
  ensureNoPolicy(): Cypress.Chainable {
    this.waitForPolicyLoad();

    this.policySelect().self().then(($select) => {
      if (!$select.hasClass('vs--disabled')) {
        this.selectPolicy(CruK3kPo.NO_POLICY);
      }
    });

    // the mode radios render only when no policy is selected
    return this.modeSection().should('exist');
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

  // matched on the whole title, so 'Agents' does not match 'Server and Agents'
  section(title: string): Cypress.Chainable {
    return this.self().contains('.rc-section > .section-header .title', new RegExp(`^\\s*${ title }\\s*$`)).closest('.rc-section');
  }

  // RcSection keeps collapsed content mounted but hidden, so open it before asserting visibility
  expandSection(title: string): Cypress.Chainable {
    return this.section(title).then(($section) => {
      const $header = $section.children('.section-header');

      if ($header.hasClass('collapsed')) {
        cy.wrap($header).click();
      }

      return cy.wrap($section);
    });
  }

  // RadioButton puts its label in the input's data-testid
  exposeOption(label: 'Not Exposed' | 'Ingress' | 'Load Balancer' | 'Node Port'): Cypress.Chainable {
    return this.section('Direct API Server Exposure').find(`input[type="radio"][data-testid="${ label }"]`).closest('label.radio-container');
  }

  // LabeledInput binds $attrs, including data-testid, to its input element
  loadBalancerServerPort(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-expose-lb-server-port"]');
  }

  loadBalancerEtcdPort(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-expose-lb-etcd-port"]');
  }

  loadBalancerServerPortBanner(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-expose-lb-server-port-unsupported"]');
  }

  nodeSelectorTitle(): Cypress.Chainable {
    return this.self().contains('h3', /^\s*Node Selector\s*$/);
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
