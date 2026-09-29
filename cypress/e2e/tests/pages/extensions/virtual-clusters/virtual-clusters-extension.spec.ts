import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';
import { LONG_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import ExtensionsPagePo from '../../../../po/extensions-page.po';
import VirtualClustersLandingPagePo from '../../../../po/virtual-clusters-landing.po';
import {
  loginAsAdmin, rancherVersion, clusterIdByName, waitForClusterActive, waitForClusterConnected,
  describeCluster, describeClusterMachines, describeInfraMachines, deleteResource, createAwsHostCluster
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
// A single node carries etcd, the control plane and calico. t3a.medium (2 vCPU /
// 4 GiB) is RKE2's documented minimum, and on a burstable instance that ran out of
// CPU credits the control plane intermittently never finished initialising.
const AWS_INSTANCE_TYPE = 't3a.xlarge';
// waitForClusterActive polls every 1.5s; an EC2 RKE2 cluster takes 10-15 min to
// become active, so allow ~20 min.
const CLUSTER_ACTIVE_RETRIES = 800;
// The agent connects shortly after the cluster goes active - ~5 min at 1.5s per poll.
const CLUSTER_CONNECTED_RETRIES = 200;

/**
 * Open the downstream cluster and wait for its side nav to be populated.
 *
 * Both tests assert on a nav entry right after a full page load. `exist` would just be
 * flaky, but `not.exist` is worse: it passes trivially against a nav that has not
 * rendered yet, so the uninstall test could go green without the entry ever having
 * gone away. Wait for the nav to hold groups before asserting anything about it.
 */
function goToClusterAndWaitForNav(clusterId: string): ProductNavPo {
  ClusterDashboardPagePo.goTo(clusterId);
  new ClusterDashboardPagePo(clusterId).waitForPage();

  const productNav = new ProductNavPo();

  productNav.self(LONG_TIMEOUT_OPT).should('exist');
  productNav.groups().should('have.length.greaterThan', 0);

  return productNav;
}

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
        if (active) {
          return;
        }

        // Say what the cluster was still waiting on - the run costs ~25 minutes to reach here
        return describeCluster(CLUSTER_NAMESPACE, name).then((why) => {
          return describeClusterMachines(CLUSTER_NAMESPACE, name).then((machines) => {
            return describeInfraMachines(CLUSTER_NAMESPACE, name).then((ec2) => {
              expect(active, `host cluster '${ name }' did not become active. ${ why }. ${ machines }. ${ ec2 }`).to.eq(true);
            });
          });
        });
      });

      clusterIdByName(name).then((id) => {
        hostClusterId = id;

        // Being active is not enough to browse to /c/<id>/explorer: the dashboard
        // redirects to /dashboard/home until the cluster's agent is connected.
        waitForClusterConnected(id, CLUSTER_CONNECTED_RETRIES).then((connected) => {
          expect(connected, `host cluster '${ name }' agent never connected`).to.eq(true);
        });
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
    extensionsPo.waitForCatalog();
    cy.then(() => {
      removeExtension = true;
    });
    extensionsPo.installExtensionFromCatalog(EXTENSION_NAME, HELM_REPO_NAME, 'vcInstall');
  });

  it('shows the Virtual Clusters navigation entry and landing page on the downstream cluster', () => {
    const productNav = goToClusterAndWaitForNav(hostClusterId);

    productNav.self().contains('.accordion.has-children', NAV_LABEL, LONG_TIMEOUT_OPT).should('exist');
    productNav.navToSideMenuGroupByLabel(NAV_LABEL);

    const landingPage = new VirtualClustersLandingPagePo(hostClusterId);

    landingPage.waitForPage();
    landingPage.title(LONG_TIMEOUT_OPT).should('be.visible');
  });

  it('uninstalls the extension and removes the navigation entry', () => {
    const extensionsPo = new ExtensionsPagePo();

    extensionsPo.goTo();
    extensionsPo.waitForPage();
    extensionsPo.waitForCatalog();
    // the Installed tab itself renders once the UIPlugin list comes back
    extensionsPo.waitForInstalledTab();
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

    goToClusterAndWaitForNav(hostClusterId)
      .self()
      .contains('.accordion.has-children', NAV_LABEL)
      .should('not.exist');
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
