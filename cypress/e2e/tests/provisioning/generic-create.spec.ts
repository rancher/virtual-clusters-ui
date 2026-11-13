import { EXTRA_LONG_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import CruK3kPo from '../../po/cru-k3k.po';
import { HOST_CLUSTER, openCreateForm } from '../../utils/provisioning';
import {
  clusterIdByName, createNamespace, createProject, createVirtualClusterPolicy, deleteResource, k3kIsInstalled, loginAsAdmin,
  uninstallK3k, K3K_POLICY_TYPE
} from '../../utils/rancher-api';
import {
  checkK3kCluster, checkNamespace, checkProvisioningCluster, deleteVirtualClusterResources, VirtualCluster
} from '../../utils/virtual-clusters';

describe('virtual cluster creation', { tags: ['@adminUser'] }, () => {
  let hostClusterId = '';
  let removeK3k = false;
  const created: VirtualCluster[] = [];

  before(() => {
    loginAsAdmin();

    clusterIdByName(HOST_CLUSTER).then((id) => {
      hostClusterId = id;

      // uninstall k3k after this test, if it was not installed when the test began
      k3kIsInstalled(id).then((installed) => {
        removeK3k = !installed;
      });
      cy.installK3k(id);
    });
  });

  beforeEach(() => {
    loginAsAdmin();
  });


  function newVirtualCluster(context: string): Cypress.Chainable<VirtualCluster> {
    return cy.createE2EResourceName(context).then((base: string) => {
      const name = `${ base }-${ Cypress.currentRetry }`;
      const vc = {
        hostClusterId, name, namespace: `${ name }-ns`
      };

      created.push(vc);

      return cy.wrap(vc);
    });
  }

  function fillCreateForm(vc: VirtualCluster): CruK3kPo {
    const cruK3k = openCreateForm();

    cruK3k.nameNsDescription().name().set(vc.name);
    cruK3k.selectHostCluster(HOST_CLUSTER);
    cruK3k.ensureNoPolicy();
    cruK3k.createTargetNamespace(vc.namespace);

    return cruK3k;
  }

  // verify that the ns, k3k cluster, and prov cluster objects were created
  function checkVirtualClusterCreated(vc: VirtualCluster) {
    cy.location('search', EXTRA_LONG_TIMEOUT_OPT).should('not.include', `type=${ CruK3kPo.SUB_TYPE }`);

    checkNamespace(vc, true);
    checkK3kCluster(vc, true);
    checkProvisioningCluster(vc, true);
  }

  describe('target namespace', () => {
    it('offers to create a target namespace when no policy is selected', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.ensureNoPolicy();

      cruK3k.targetNamespaceSelect().toggle();
      cruK3k.targetNamespaceSelect().getOptionsAsStrings().should('include', CruK3kPo.CREATE_NAMESPACE);
    });

    it('creates the new target namespace in the host cluster', () => {
      newVirtualCluster('vc-ns').then((vc) => {
        //
        // ClusterPolicy posts to the singular type, /v1/namespace
        cy.intercept({ method: 'POST', pathname: new RegExp(`^/k8s/clusters/${ hostClusterId }/v1/namespaces?$`) }).as('createNamespace');

        const cruK3k = fillCreateForm(vc);

        cruK3k.save().click();

        cy.wait('@createNamespace').then(({ request, response }) => {
          expect(response?.statusCode, 'create namespace').to.eq(201);
          expect(request.body?.metadata?.name, 'namespace name').to.eq(vc.namespace);
        });

        checkVirtualClusterCreated(vc);
      });
    });

    describe('with a policy assigned to the host cluster', () => {
      let projectId = '';
      let policyName = '';

      before(() => {
        loginAsAdmin();

        cy.createE2EResourceName('vc-ns-policy').then((name: string) => {
          policyName = name;

          createProject(hostClusterId, name).then((project) => {
            projectId = project;

            createVirtualClusterPolicy(hostClusterId, policyName, project);
            createNamespace(hostClusterId, `${ policyName }-ns`, project, policyName);
          });
        });
      });

      after('remove the policy, its namespace and project', () => {
        const prefix = `k8s/clusters/${ hostClusterId }/v1`;

        if (policyName) {
          deleteResource(prefix, 'namespaces', `${ policyName }-ns`);
          deleteResource(prefix, K3K_POLICY_TYPE, policyName);
        }
        if (projectId) {
          deleteResource('v3', 'projects', projectId);
        }
      });

      it('does not offer to create a target namespace when a policy is selected', () => {
        const cruK3k = openCreateForm();

        cruK3k.selectHostCluster(HOST_CLUSTER);
        cruK3k.waitForPolicyLoad();
        cruK3k.selectPolicy(policyName);

        cruK3k.targetNamespaceSelect().toggle();
        cruK3k.targetNamespaceSelect().getOptionsAsStrings().should('not.include', CruK3kPo.CREATE_NAMESPACE);
      });
    });
  });

  describe('when creation fails partway through', () => {
    it('removes the k3k cluster and the new namespace when the provisioning cluster cannot be created, and creates the virtual cluster on the next attempt', () => {
      newVirtualCluster('vc-redo-prov').then((vc) => {
        cy.intercept(
          {
            method: 'POST', pathname: '/v1/provisioning.cattle.io.clusters', times: 1
          },
          { statusCode: 500, body: { type: 'error', message: 'e2e: provisioning cluster rejected' } }
        ).as('rejectProvisioningCluster');

        const cruK3k = fillCreateForm(vc);

        cruK3k.save().click();
        cy.wait('@rejectProvisioningCluster');
        cruK3k.errorBanner().self().should('exist');

        checkK3kCluster(vc, false);
        checkNamespace(vc, false);
        checkProvisioningCluster(vc, false);

        cruK3k.save().click();

        checkVirtualClusterCreated(vc);
      });
    });

    //
    // the new namespace is left in place when the k3k cluster cannot be created
    it('creates the virtual cluster on the next attempt when the k3k cluster cannot be created', () => {
      newVirtualCluster('vc-redo-k3k').then((vc) => {
        cy.intercept(
          {
            method: 'POST', pathname: `/k8s/clusters/${ hostClusterId }/v1/k3k.io.clusters`, times: 1
          },
          { statusCode: 500, body: { type: 'error', message: 'e2e: k3k cluster rejected' } }
        ).as('rejectK3kCluster');

        const cruK3k = fillCreateForm(vc);

        cruK3k.save().click();
        cy.wait('@rejectK3kCluster');
        cruK3k.errorBanner().self().should('exist');

        checkK3kCluster(vc, false);
        checkProvisioningCluster(vc, false);

        cruK3k.save().click();

        checkVirtualClusterCreated(vc);
      });
    });
  });

  after('remove virtual clusters and k3k', () => {
    created.forEach((vc) => deleteVirtualClusterResources(vc));

    if (hostClusterId && removeK3k) {
      uninstallK3k(hostClusterId);
    }
  });
});
