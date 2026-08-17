import ClusterManagerCreatePagePo from '@rancher/cypress/e2e/po/edit/provisioning.cattle.io.cluster/create/cluster-create.po';

import CruK3kPo from '../../po/cru-k3k.po';
import { openCreateForm } from '../../utils/provisioning';
import {
  loginAsAdmin, clusterIdByName, deleteResource, uninstallK3k, createProject, createNamespace,
  createVirtualClusterPolicy, K3K_POLICY_TYPE
} from '../../utils/rancher-api';

// CI imports a k3d cluster with this name (scripts/e2e-import-generic-cluster.sh)
const HOST_CLUSTER = Cypress.env('hostCluster') || 'e2e-generic';
const NO_POLICY = 'No policy';
const RESOURCE_SYNC_SECTION = 'Resource Synchronization';

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
