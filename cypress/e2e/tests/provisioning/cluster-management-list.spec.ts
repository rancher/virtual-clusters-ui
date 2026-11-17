import HomePagePo from '@rancher/cypress/e2e/po/pages/home.po';
import ClusterManagerListPagePo from '@rancher/cypress/e2e/po/pages/cluster-manager/cluster-manager-list.po';
import PromptRemove from '@rancher/cypress/e2e/po/prompts/promptRemove.po';

import { HOST_CLUSTER } from '../../utils/provisioning';
import { clusterIdByName, k3kIsInstalled, loginAsAdmin, uninstallK3k } from '../../utils/rancher-api';
import {
  checkImportConfigMap, checkImportJob, checkK3kCluster, checkProvisioningCluster, createVirtualClusterResources,
  deleteVirtualClusterResources, VirtualCluster
} from '../../utils/virtual-clusters';

describe('virtual clusters in the cluster management list', { tags: ['@adminUser'] }, () => {
  let hostClusterId = '';
  let removeK3k = false;
  const created: VirtualCluster[] = [];

  before(() => {
    loginAsAdmin();

    clusterIdByName(HOST_CLUSTER).then((id) => {
      hostClusterId = id;

      k3kIsInstalled(id).then((installed) => {
        removeK3k = !installed;
      });
      cy.installK3k(id);
    });
  });

  beforeEach(() => {
    loginAsAdmin();
  });


  function createVirtualCluster(context: string): Cypress.Chainable<VirtualCluster> {
    return cy.createE2EResourceName(context).then((base: string) => {
      const name = `${ base }-${ Cypress.currentRetry }`;
      const vc = {
        hostClusterId, name, namespace: `${ name }-ns`
      };

      created.push(vc);
      createVirtualClusterResources(vc);

      return cy.wrap(vc);
    });
  }

  function openClusterList(): ClusterManagerListPagePo {
    const clusterList = new ClusterManagerListPagePo();


    HomePagePo.goTo();
    ClusterManagerListPagePo.navTo();
    clusterList.waitForPage();
    clusterList.sortableTable().checkLoadingIndicatorNotVisible();

    return clusterList;
  }


  it('shows k3k as the provider of a virtual cluster', () => {
    createVirtualCluster('vc-provider').then((vc) => {
      openClusterList().list().providerSubType(vc.name).should('contain.text', 'k3k');
    });
  });

  it('removes the k3k cluster and its import job and config map from the host cluster when the virtual cluster is deleted', () => {
    createVirtualCluster('vc-delete').then((vc) => {
      const clusterList = openClusterList();

      clusterList.list().actionMenu(vc.name).getMenuItem('Delete').click();

      const prompt = new PromptRemove();

      prompt.confirm(vc.name);
      prompt.remove();

      checkProvisioningCluster(vc, false);
      checkK3kCluster(vc, false);
      checkImportJob(vc, false);
      checkImportConfigMap(vc, false);
    });
  });

  after('remove virtual clusters and k3k', () => {
    created.forEach((vc) => deleteVirtualClusterResources(vc));

    if (hostClusterId && removeK3k) {
      uninstallK3k(hostClusterId);
    }
  });
});
