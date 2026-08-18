import ClusterManagerCreatePagePo from '@rancher/cypress/e2e/po/edit/provisioning.cattle.io.cluster/create/cluster-create.po';
import { LoginPagePo } from '@rancher/cypress/e2e/po/pages/login-page.po';

import CruK3kPo from '../../po/cru-k3k.po';

describe('cluster creation', () => {
  beforeEach(() => {
    // cy.login()'s default navigation checks for the "Welcome to Rancher"
    // message, which Rancher Prime doesn't render - navigate to the login
    // page ourselves and pass skipNavigation instead.
    LoginPagePo.goTo();
    const loginPage = new LoginPagePo();

    loginPage.checkIsCurrentPage();

    cy.login(undefined, undefined, false, true);
  });

  it('shows a card for the k3k provisioner', { tags: ['@adminUser', '@standardUser'] }, () => {
    ClusterManagerCreatePagePo.goTo('_');
    const clusterCreate = new ClusterManagerCreatePagePo(  );

    clusterCreate.waitForPage();

    clusterCreate.gridElementExistanceByName('K3K', 'be.visible');
  });

  it('offers admins an Install K3k button when a cluster without k3k is selected', { tags: ['@adminUser'] }, () => {
    ClusterManagerCreatePagePo.goTo('_');
    const clusterCreate = new ClusterManagerCreatePagePo();

    clusterCreate.waitForPage();

    clusterCreate.resourceDetail().cruResource().selectSubType(1, 0).click();

    const cruK3k = new CruK3kPo();

    cruK3k.waitForHostClusterLoad();
    cruK3k.selectHostCluster('e2e-generic');
    cruK3k.installK3kButton().self().should('be.visible');
  });

  it('does not allow standard users to select clusters without k3k installed', { tags: ['@standardUser'] }, () => {
    ClusterManagerCreatePagePo.goTo( '_');
    const clusterCreate = new ClusterManagerCreatePagePo();

    clusterCreate.waitForPage();

    clusterCreate.resourceDetail().cruResource().selectSubType(1, 0).click();

    const cruK3k = new CruK3kPo();

    cruK3k.waitForHostClusterLoad();
    cruK3k.hostClusterOptionLabels().should('not.include', 'e2e-generic');
  });
});
