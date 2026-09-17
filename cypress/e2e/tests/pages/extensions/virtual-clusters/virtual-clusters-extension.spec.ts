import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';

import ExtensionsPagePo from '../../../../po/extensions-page.po';
import VirtualClustersLandingPagePo from '../../../../po/virtual-clusters-landing.po';
import {
  loginAsAdmin, rancherVersion, clusterIdByName, waitForClusterActive, deleteResource, createAwsHostCluster
} from '../../../../utils/rancher-api';

const EXTENSION_NAME = 'Virtual Clusters';
const NAV_LABEL = 'Virtual Clusters';
const HELM_REPO_URL = 'https://rancher.github.io/virtual-clusters-ui';
const HELM_REPO_NAME = 'virtual-clusters-ui';
// UIPlugin created by a catalog install is named after the chart
const UI_PLUGIN_ID = 'cattle-ui-plugin-system/virtual-clusters';

const CLUSTER_NAMESPACE = 'fleet-default';
// EC2 placement for the host cluster, matching what rancher/dashboard's own
// provisioning specs use. Only the credentials come from the environment.
const AWS_REGION = 'us-west-1';
const AWS_ZONE = 'a';
const AWS_VPC_ID = 'vpc-081cec85dbe35e9bd';
const AWS_INSTANCE_TYPE = 't3a.medium';
// waitForClusterActive polls every 1.5s; an EC2 RKE2 cluster takes 10-15 min to
// become active, so allow ~20 min.
const CLUSTER_ACTIVE_RETRIES = 800;

// The extension is Prime-only (catalog.cattle.io/prime-only) and every product it
// registers is hidden behind isRancherPrime(), so fail fast with a clear message
// rather than timing out on a missing card later.
function assertRancherPrime() {
  rancherVersion().then((version) => {
    expect(
      version.RancherPrime?.toLowerCase(),
      `${ EXTENSION_NAME } is Prime-only, but /rancherversion reports RancherPrime=${ version.RancherPrime }`
    ).to.eq('true');
  });
}

describe('Virtual Clusters extension', { testIsolation: false, tags: ['@adminUser', '@jenkins'] }, () => {
  let hostClusterName = '';
  let hostClusterId = '';
  let removeHostCluster = false;
  let removeRepo = false;
  let removeExtension = false;

  before(() => {
    loginAsAdmin();
    assertRancherPrime();

    // Provision the downstream host cluster the virtual clusters will live in.
    cy.createE2EResourceName('vc-host').then((name: string) => {
      hostClusterName = name;
      removeHostCluster = true;

      createAwsHostCluster({
        name,
        namespace:    CLUSTER_NAMESPACE,
        region:       AWS_REGION,
        accessKey:    Cypress.env('awsAccessKey'),
        secretKey:    Cypress.env('awsSecretKey'),
        instanceType: AWS_INSTANCE_TYPE,
        vpcId:        AWS_VPC_ID,
        zone:         AWS_ZONE,
      });

      waitForClusterActive(CLUSTER_NAMESPACE, name, CLUSTER_ACTIVE_RETRIES).then((active) => {
        expect(active, `host cluster '${ name }' did not become active`).to.eq(true);
      });

      clusterIdByName(name).then((id) => {
        hostClusterId = id;
      });
    });

    // Add the published chart repository and install the extension from it. The teardown
    // flags are raised before each step rather than after, so a failure part way through
    // still cleans up - deleteResource tolerates anything that was never created.
    const extensionsPo = new ExtensionsPagePo();

    cy.then(() => {
      removeRepo = true;
    });
    extensionsPo.addHelmRepository(HELM_REPO_URL, HELM_REPO_NAME);

    extensionsPo.goTo();
    extensionsPo.waitForPage();
    cy.then(() => {
      removeExtension = true;
    });
    extensionsPo.installExtensionFromCatalog(EXTENSION_NAME, HELM_REPO_NAME, 'vcInstall');
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
      deleteResource('v1', 'catalog.cattle.io.uiplugins', UI_PLUGIN_ID);
    }
    if (removeRepo) {
      deleteResource('v1', 'catalog.cattle.io.clusterrepos', HELM_REPO_NAME);
    }
    if (removeHostCluster) {
      deleteResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, hostClusterName);
    }
  });
});
