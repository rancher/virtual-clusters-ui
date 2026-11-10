import ClusterManagerCreatePagePo from '@rancher/cypress/e2e/po/edit/provisioning.cattle.io.cluster/create/cluster-create.po';

import CruK3kPo from '../../po/cru-k3k.po';
import { HOST_CLUSTER, openCreateForm } from '../../utils/provisioning';
import {
  loginAsAdmin, clusterIdByName, deleteResource, uninstallK3k, createProject, createNamespace,
  createVirtualClusterPolicy, K3K_POLICY_TYPE, K3K_NAMESPACE, K3K_CHART_NAME
} from '../../utils/rancher-api';

const { NO_POLICY } = CruK3kPo;
const RESOURCE_SYNC_SECTION = 'Resource Synchronization';
const TOPOLOGY_SECTION = 'Topology';

describe('cluster creation', () => {
  beforeEach(() => {
    // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
    loginAsAdmin();
  });

  it('shows a card for the k3k provisioner', { tags: ['@adminUser', '@standardUser'] }, () => {
    ClusterManagerCreatePagePo.goTo('_');
    const clusterCreate = new ClusterManagerCreatePagePo();

    clusterCreate.waitForPage();

    clusterCreate.gridElementExistanceByName('K3K', 'be.visible');
  });

  it('offers admins an Install K3k button when a cluster without k3k is selected', { tags: ['@adminUser'] }, () => {
    const cruK3k = CruK3kPo.goToCreate();

    // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
    cruK3k.waitForHostClusterLoad();
    cruK3k.selectHostCluster(HOST_CLUSTER);
    cruK3k.installK3kButton().self().should('be.visible');
  });

  it('does not allow standard users to select clusters without k3k installed', { tags: ['@standardUser'] }, () => {
    const cruK3k = CruK3kPo.goToCreate();

    // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
    cruK3k.waitForHostClusterLoad();
    cruK3k.hostClusterOptionLabels().should('not.include', HOST_CLUSTER);
  });

  it('keeps the policy select disabled until a host cluster with k3k is selected', { tags: ['@adminUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.policySelect().self().should('have.class', 'vs--disabled');

    cruK3k.selectHostCluster(HOST_CLUSTER);
    cruK3k.installK3kButton().self().should('be.visible');
    cruK3k.policySelect().self().should('have.class', 'vs--disabled');
  });

  it('renders a table of contents of the form sections', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.ensureNoPolicy();
    cruK3k.tableOfContents().should('be.visible');

    // Member Roles depends on the user's permissions and Topology on the host's k3k version,
    // so only check the sections every user sees, in form order
    const expected = ['Basics', RESOURCE_SYNC_SECTION, 'Server and Agents', 'Networking', 'Advanced'];

    cruK3k.tocTopLevelLabels().then((labels) => {
      expect(labels.filter((l) => expected.includes(l))).to.deep.equal(expected);
    });

    // nested sections are listed under their parent
    cruK3k.tocEntry('Server Persistence').should('have.class', 'toc-child-link');
  });

  it('scrolls to a section from the table of contents', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.tocEntry('Advanced').click();

    cruK3k.self().find('.cru__content').contains(/^\s*Advanced\s*$/).should(($el) => {
      const { top } = $el[0].getBoundingClientRect();

      expect(top, 'section header is in the viewport').to.be.within(0, Cypress.config('viewportHeight'));
    });
  });

  /**
   * k3k < 1.3.0 does not handle a non-default load balancer server port
   * (https://github.com/rancher/k3k/issues/1309), so the form disables that input in every mode.
   * The form reads the k3k version from the k3k app on the host cluster; each test stubs that app,
   * so these tests do not depend on whether k3k is installed.
   */
  describe('load balancer server port', { tags: ['@adminUser'] }, () => {
    const K3K_MODES = ['shared', 'virtual', 'hcp'] as const;
    let hostClusterId = '';

    before(() => {
      loginAsAdmin();

      clusterIdByName(HOST_CLUSTER).then((id) => {
        hostClusterId = id;
      });
    });

    function k3kAppRoute() {
      return { method: 'GET', pathname: `/k8s/clusters/${ hostClusterId }/v1/catalog.cattle.io.apps/${ K3K_NAMESPACE }/${ K3K_CHART_NAME }` };
    }

    // no appVersion fails the request, as for a user who cannot read the app
    function k3kAppResponse(appVersion?: string) {
      return appVersion ? { body: { spec: { chart: { metadata: { appVersion } } } } } : { statusCode: 404, body: {} };
    }

    function openLoadBalancerForm(): CruK3kPo {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.ensureNoPolicy();
      cruK3k.expandSection('Networking');
      cruK3k.expandSection('Direct API Server Exposure');
      cruK3k.exposeOption('Load Balancer').click();

      return cruK3k;
    }

    // K3kVersionBanner and the form each read the app when the host cluster is selected
    // waiting for both keeps an 'enabled' assertion from passing before the form has the version
    function waitForK3kApp() {
      cy.wait('@k3kApp');
      cy.wait('@k3kApp');
    }

    K3K_MODES.forEach((mode) => {
      it(`disables the server port and shows a warning in ${ mode } mode when k3k is older than 1.3.0`, () => {
        cy.intercept(k3kAppRoute(), k3kAppResponse('v1.2.1')).as('k3kApp');

        const cruK3k = openLoadBalancerForm();

        waitForK3kApp();
        cruK3k.modeOption(mode).click();

        cruK3k.loadBalancerServerPortBanner().scrollIntoView().should('be.visible').and('contain', '1.3.0');
        cruK3k.loadBalancerServerPort().should('be.disabled');
        cruK3k.loadBalancerEtcdPort().should('be.enabled');
      });

      it(`allows a server port in ${ mode } mode when k3k is 1.3.0`, () => {
        cy.intercept(k3kAppRoute(), k3kAppResponse('v1.3.0')).as('k3kApp');

        const cruK3k = openLoadBalancerForm();

        waitForK3kApp();
        cruK3k.modeOption(mode).click();

        cruK3k.loadBalancerServerPort().should('be.enabled');
        cruK3k.loadBalancerServerPortBanner().should('not.exist');
      });
    });

    // k3k may not be installed yet, and a new install is >= 1.3.0
    it('allows a server port when the k3k version cannot be read', () => {
      cy.intercept(k3kAppRoute(), k3kAppResponse()).as('k3kApp');

      const cruK3k = openLoadBalancerForm();

      waitForK3kApp();

      cruK3k.loadBalancerServerPort().should('be.enabled');
      cruK3k.loadBalancerServerPortBanner().should('not.exist');
    });

    // the input is enabled while the version is unknown
    // the app response is held until a port is typed, then released
    it('clears a server port typed before the k3k version is known', () => {
      let releaseK3kApp: () => void = () => undefined;
      const k3kAppHeld = new Promise<void>((resolve) => {
        releaseK3kApp = () => resolve();
      });

      cy.intercept(k3kAppRoute(), (req) => k3kAppHeld.then(() => req.reply(k3kAppResponse('v1.2.1')))).as('k3kApp');

      const cruK3k = openLoadBalancerForm();

      cruK3k.loadBalancerServerPort().type('6443');
      cruK3k.loadBalancerServerPort().should('have.value', '6443');

      // the store merges identical in-flight GETs, so both readers share one held request
      cy.then(() => releaseK3kApp());
      cy.wait('@k3kApp');

      cruK3k.loadBalancerServerPort().should('be.disabled').and('have.value', '');
    });
  });

  /**
   * Runs after the tests above, which need the host cluster without k3k.
   * k3k is removed again afterwards so a re-run starts from the same state.
   */
  describe('with k3k installed in the host cluster', { tags: ['@adminUser'] }, () => {
    let hostClusterId = '';
    let projectId = '';
    let policyName = '';
    let policyNamespace = '';

    before(() => {
      loginAsAdmin();

      clusterIdByName(HOST_CLUSTER).then((id) => {
        hostClusterId = id;

        cy.installK3k(id);

        cy.createE2EResourceName('vc-policy').then((name: string) => {
          policyName = name;
          policyNamespace = `${ name }-ns`;

          createProject(id, name).then((project) => {
            projectId = project;

            createVirtualClusterPolicy(id, policyName, project);
            createNamespace(id, policyNamespace, project, policyName);
          });
        });
      });
    });

    it('does not offer to install k3k in a host cluster that already has it', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();

      cruK3k.policySelect().self().should('not.have.class', 'vs--disabled');
      cruK3k.installK3kButton().self().should('not.exist');
    });

    it('lists the policies assigned to the host cluster and preselects the only one', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();

      cruK3k.policySelect().checkContainsOptionSelected(policyName);
      cruK3k.policyOptionLabels().should('deep.equal', [NO_POLICY, policyName]);
    });

    it('offers only the policy namespaces as targets once a policy is selected', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();

      cruK3k.targetNamespaceSelect().checkContainsOptionSelected(policyNamespace);

      cruK3k.selectPolicy(NO_POLICY);
      cruK3k.targetNamespaceSelect().self().find('.vs__selected').should('not.exist');
      cruK3k.targetNamespaceSelect().toggle();
      cruK3k.targetNamespaceSelect().getOptionsAsStrings().should('not.include', policyNamespace);
    });

    it('hides the configuration a policy controls', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();
      cruK3k.policySelect().checkContainsOptionSelected(policyName);

      cruK3k.modeSection().should('not.exist');
      cruK3k.tocTopLevelLabels().should('not.include', RESOURCE_SYNC_SECTION);

      cruK3k.selectPolicy(NO_POLICY);

      cruK3k.modeSection().should('be.visible');
      cruK3k.tocTopLevelLabels().should('include', RESOURCE_SYNC_SECTION);
    });

    // 'No policy' is stored as an empty policy object, which must count as no policy
    // the installed k3k version is the newest, which supports the Topology fields
    it('offers the scheduling configuration when no policy is selected', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();
      cruK3k.policySelect().checkContainsOptionSelected(policyName);

      cruK3k.tocTopLevelLabels().should('not.include', TOPOLOGY_SECTION);
      cruK3k.nodeSelectorTitle().should('not.exist');

      cruK3k.selectPolicy(NO_POLICY);

      cruK3k.tocTopLevelLabels().should('include', TOPOLOGY_SECTION);
      cruK3k.nodeSelectorTitle().should('be.visible');

      cruK3k.modeOption('hcp').click();
      cruK3k.expandSection(TOPOLOGY_SECTION).within(() => {
        cy.contains('Server Scheduling').should('be.visible');
      });
    });

    it('opens the selected policy in a drawer', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();

      cruK3k.viewPolicyButton().click();
      cy.get('.chrome .header .title').should('contain', policyName);
    });

    after('clean up', () => {
      if (!hostClusterId) {
        return;
      }

      const prefix = `k8s/clusters/${ hostClusterId }/v1`;

      if (policyName) {
        deleteResource(prefix, 'namespaces', policyNamespace);
        deleteResource(prefix, K3K_POLICY_TYPE, policyName);
      }
      if (projectId) {
        deleteResource('v3', 'projects', projectId);
      }
      uninstallK3k(hostClusterId);
    });
  });
});
