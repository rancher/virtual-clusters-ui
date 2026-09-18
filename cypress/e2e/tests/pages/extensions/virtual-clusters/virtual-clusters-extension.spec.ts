import { LoginPagePo } from '@rancher/cypress/e2e/po/pages/login-page.po';
import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';

import ExtensionsPagePo from '../../../../po/extensions-page.po';
import VirtualClustersLandingPagePo from '../../../../po/virtual-clusters-landing.po';

const EXTENSION_NAME = 'Virtual Clusters';
const NAV_LABEL = 'Virtual Clusters';
const HELM_REPO_URL = 'https://rancher.github.io/virtual-clusters-ui';
const HELM_REPO_NAME = 'virtual-clusters-ui';
// UIPlugin created by a catalog install is named after the chart
const UI_PLUGIN_ID = 'cattle-ui-plugin-system/virtual-clusters';

const CLUSTER_NAMESPACE = 'fleet-default';
const AWS_REGION = 'us-west-1';
// waitForRancherResource polls every 1.5s; an EC2 RKE2 cluster takes 10-15 min to
// become active, so allow ~20 min. A cluster supplied via TEST_HOST_CLUSTER should
// already be active, so give it 30s at most.
const CLUSTER_ACTIVE_RETRIES = 800;
const EXISTING_CLUSTER_ACTIVE_RETRIES = 20;

// cy.login()'s default navigation checks for the "Welcome to Rancher" message,
// which Rancher Prime doesn't render - navigate ourselves and pass skipNavigation.
// TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
function login() {
  LoginPagePo.goTo();
  new LoginPagePo().checkIsCurrentPage();
  cy.login(undefined, undefined, false, true);
}

// The extension is Prime-only (catalog.cattle.io/prime-only) and every product it
// registers is hidden behind isRancherPrime(), so fail fast with a clear message
// rather than timing out on a missing card later.
function assertRancherPrime() {
  cy.getRancherVersion().then((version) => {
    expect(
      version.RancherPrime?.toLowerCase(),
      `${ EXTENSION_NAME } is Prime-only, but /rancherversion reports RancherPrime=${ version.RancherPrime }`
    ).to.eq('true');
  });
}

describe('Virtual Clusters extension', { testIsolation: false, tags: ['@virtualClusters', '@extensions', '@jenkins', '@adminUser'] }, () => {
  let hostClusterName = '';
  let hostClusterId = '';
  let removeHostCluster = false;
  let removeRepo = false;
  let removeExtension = false;

  // hostClusterName is resolved asynchronously above, so read it inside the queue
  function waitForHostClusterActive(retries: number) {
    cy.then(() => {
      cy.waitForResourceState('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, hostClusterName, 'active', retries)
        .then((active) => {
          expect(active, `host cluster '${ hostClusterName }' is not active`).to.eq(true);
        });
    });
  }

  before(function() {
    const existingHostCluster = Cypress.env('hostCluster');

    // Jenkins owns the Rancher setup and exports TEST_JENKINS=true plus the AWS
    // credentials. Anywhere else there is nothing to provision against, so skip -
    // unless an existing downstream cluster was named with TEST_HOST_CLUSTER.
    if (!Cypress.env('jenkins') && !existingHostCluster) {
      // Cypress.log is synchronous; a queued cy.log would never run once we skip
      Cypress.log({ name: 'skip', message: 'this suite provisions an EC2 host cluster and only runs on Jenkins (TEST_JENKINS=true), or against an existing cluster (TEST_HOST_CLUSTER=<name>)' });
      this.skip();
    }

    login();
    assertRancherPrime();

    if (existingHostCluster) {
      // Use the cluster we were given. getClusterIdByName throws a clear error if
      // it doesn't exist, which is the "no downstream cluster" fail-fast.
      hostClusterName = existingHostCluster;
      cy.getClusterIdByName(hostClusterName).then((id) => {
        hostClusterId = id;
      });
      waitForHostClusterActive(EXISTING_CLUSTER_ACTIVE_RETRIES);
    } else {
      // Provision the downstream host cluster the virtual clusters will live in.
      cy.createE2EResourceName('vc-host').then((name) => {
        hostClusterName = name;

        cy.createAmazonRke2ClusterWithoutMachineConfig({
          cloudCredentialsAmazon: {
            workspace: CLUSTER_NAMESPACE,
            name,
            region:    AWS_REGION,
            accessKey: Cypress.env('awsAccessKey'),
            secretKey: Cypress.env('awsSecretKey'),
          },
          rke2ClusterAmazon: {
            clusterName: name,
            namespace:   CLUSTER_NAMESPACE,
          },
        }).then(() => {
          removeHostCluster = true;
        });

        waitForHostClusterActive(CLUSTER_ACTIVE_RETRIES);

        cy.getClusterIdByName(name).then((id) => {
          hostClusterId = id;
        });
      });
    }

    // Add the published chart repository and install the extension from it.
    const extensionsPo = new ExtensionsPagePo();

    extensionsPo.goTo();
    extensionsPo.waitForPage();
    extensionsPo.addHelmRepository(HELM_REPO_URL, HELM_REPO_NAME).then(() => {
      removeRepo = true;
    });

    extensionsPo.goTo();
    extensionsPo.waitForPage();
    extensionsPo.installExtensionFromCatalog(EXTENSION_NAME, HELM_REPO_NAME, 'vcInstall');
    cy.then(() => {
      removeExtension = true;
    });
  });

  it('shows the Virtual Clusters navigation entry and landing page on the downstream cluster', () => {
    ClusterDashboardPagePo.goTo(hostClusterId);
    new ClusterDashboardPagePo(hostClusterId).waitForPage();

    const productNav = new ProductNavPo();

    productNav.navToSideMenuGroupByLabelExistence(NAV_LABEL, 'exist');
    productNav.navToSideMenuGroupByLabel(NAV_LABEL);

    const landingPage = new VirtualClustersLandingPagePo(hostClusterId);

    landingPage.waitForPage();
    landingPage.title().should('be.visible');
  });

  it('uninstalls the extension and removes the navigation entry', () => {
    const extensionsPo = new ExtensionsPagePo();

    extensionsPo.goTo();
    extensionsPo.waitForPage();
    extensionsPo.extensionTabInstalledClick();
    extensionsPo.waitForPage(undefined, 'installed');

    extensionsPo.extensionCardUninstallClick(EXTENSION_NAME);
    extensionsPo.extensionUninstallModal().should('be.visible');
    extensionsPo.uninstallModalUninstallClick();
    extensionsPo.extensionReloadBanner().should('be.visible');
    extensionsPo.extensionReloadClick();
    cy.then(() => {
      removeExtension = false;
    });

    ClusterDashboardPagePo.goTo(hostClusterId);
    new ClusterDashboardPagePo(hostClusterId).waitForPage();

    new ProductNavPo().navToSideMenuGroupByLabelExistence(NAV_LABEL, 'not.exist');
  });

  after('clean up', () => {
    if (removeExtension) {
      cy.deleteRancherResource('v1', 'catalog.cattle.io.uiplugins', UI_PLUGIN_ID, false);
    }
    if (removeRepo) {
      cy.deleteRancherResource('v1', 'catalog.cattle.io.clusterrepos', HELM_REPO_NAME, false);
    }
    if (removeHostCluster) {
      cy.deleteRancherResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, hostClusterName, false);
    }
  });
});
