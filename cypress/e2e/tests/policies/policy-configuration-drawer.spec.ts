import PolicyDrawerPo from '../../po/policy-drawer.po';
import { HOST_CLUSTER, openCreateForm } from '../../utils/provisioning';
import {
  clusterIdByName, createNamespace, createProject, createVirtualClusterPolicy, deleteResource, k3kIsInstalled, loginAsAdmin,
  uninstallK3k, K3K_POLICY_TYPE
} from '../../utils/rancher-api';
import {
  createLabelledStorageClasses, deleteLabelledStorageClasses, LabelledStorageClasses, RUN_LABEL, TIER_LABEL
} from '../../utils/storage-classes';

function sharedPolicySpec(selector: Record<string, string>) {
  return { allowedMode: 'shared', sync: { storageClasses: { enabled: true, selector } } };
}

describe('policy configuration drawer', { tags: ['@adminUser'] }, () => {
  let hostClusterId = '';
  let projectId = '';
  let removeK3k = false;
  let classes = {} as LabelledStorageClasses;
  let fastPolicy = '';
  let noMatchPolicy = '';

  before(() => {
    loginAsAdmin();

    clusterIdByName(HOST_CLUSTER).then((id) => {
      hostClusterId = id;

      k3kIsInstalled(id).then((installed) => {
        removeK3k = !installed;
      });
      cy.installK3k(id);

      cy.createE2EResourceName('sc-drawer').then((run: string) => {
        fastPolicy = `${ run }-fast`;
        noMatchPolicy = `${ run }-none`;

        createLabelledStorageClasses(id, run).then((created) => {
          classes = created;
        });


        createProject(id, run).then((project) => {
          projectId = project;

          createVirtualClusterPolicy(id, fastPolicy, project, sharedPolicySpec({ [RUN_LABEL]: run, [TIER_LABEL]: 'fast' }));
          createVirtualClusterPolicy(id, noMatchPolicy, project, sharedPolicySpec({ [RUN_LABEL]: run, [TIER_LABEL]: 'none' }));
          createNamespace(id, `${ fastPolicy }-ns`, project, fastPolicy);
          createNamespace(id, `${ noMatchPolicy }-ns`, project, noMatchPolicy);
        });
      });
    });
  });

  beforeEach(() => {
    loginAsAdmin();
  });

  function openPolicyDrawer(policyName: string): PolicyDrawerPo {
    const cruK3k = openCreateForm();

    cruK3k.selectHostCluster(HOST_CLUSTER);
    cruK3k.waitForPolicyLoad();
    cruK3k.selectPolicy(policyName);
    cruK3k.viewPolicyButton().click();

    const drawer = new PolicyDrawerPo();

    drawer.title().should('contain', policyName);

    return drawer;
  }

  describe('storage class filter by label', () => {
    it('lists the storage classes that match the policy label selector', () => {
      const sync = openPolicyDrawer(fastPolicy).storageClassSync();

      sync.checkMatchedClasses([classes.fastA, classes.fastB]);
      sync.matchedCount().should('contain', '2');
      sync.labelSelector().should('contain', '2 storage classes selected');
    });

    it('shows the policy label selector read-only', () => {
      const sync = openPolicyDrawer(fastPolicy).storageClassSync();

      sync.checkLabels([[RUN_LABEL, classes.run], [TIER_LABEL, 'fast']]);
      sync.labels().self().find('[data-testid="input-kv-item-key-0"]').should('be.disabled');
      sync.labels().self().find('[data-testid="add_row_item_button"]').should('not.exist');
    });

    it('lists no storage classes when the policy label selector matches none', () => {
      // make sure we're not just verifying the empty list before loading starts
      cy.intercept({ method: 'GET', url: /\/v1\/storage\.k8s\.io\.storageclasses\?.*filter=/ }).as('matchStorageClasses');

      const sync = openPolicyDrawer(noMatchPolicy).storageClassSync();

      cy.wait('@matchStorageClasses');
      sync.checkMatchedClasses([]);
      sync.labelSelector().should('contain', '0 storage classes selected');
    });
  });

  after('clean up', () => {
    if (!hostClusterId) {
      return;
    }

    const prefix = `k8s/clusters/${ hostClusterId }/v1`;

    [fastPolicy, noMatchPolicy].filter((name) => !!name).forEach((name) => {
      deleteResource(prefix, 'namespaces', `${ name }-ns`);
      deleteResource(prefix, K3K_POLICY_TYPE, name);
    });
    if (projectId) {
      deleteResource('v3', 'projects', projectId);
    }
    if (classes.run) {
      deleteLabelledStorageClasses(hostClusterId, classes);
    }
    if (removeK3k) {
      uninstallK3k(hostClusterId);
    }
  });
});
