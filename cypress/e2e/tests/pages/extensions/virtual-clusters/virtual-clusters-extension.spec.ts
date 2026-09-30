import ClusterDashboardPagePo from '@rancher/cypress/e2e/po/pages/explorer/cluster-dashboard.po';
import ProductNavPo from '@rancher/cypress/e2e/po/side-bars/product-side-nav.po';
import { EXTRA_LONG_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import ExtensionsPagePo from '../../../../po/extensions-page.po';
import VirtualClustersLandingPagePo, { NAV_LABEL } from '../../../../po/virtual-clusters-landing.po';
import VirtualClustersPolicyListPagePo, { POLICY_NAV_LABEL } from '../../../../po/virtual-clusters-policy-list.po';
import {
  loginAsAdmin, rancherVersion, clusterIdByName, waitForClusterActive, waitForClusterConnected, createResource, deleteResource, createAwsHostCluster,
  uninstallK3k, waitForResourceState, waitForSchema, K3K_CHART_NAME, K3K_NAMESPACE, K3K_POLICY_TYPE
} from '../../../../utils/rancher-api';
import VirtualClusterPolicyPo from '~/cypress/e2e/po/virtual-cluster-policy.po';

const EXTENSION_NAME = 'Virtual Clusters';
// Which build of the extension to test:
//   'published' - install the newest published version from the chart repo, GA or rc (default)
//   'dev-load'  - CI builds it from this checkout and developer-loads it before Cypress
//                 starts, so there is no chart repo to add and nothing to install or
//                 uninstall here. The only way to reach selectors that are on main but
//                 not yet in a published chart.
//   <version>   - install that exact published version, e.g. '1.2.1' or '1.2.1-rc1'
const EXTENSION_VERSION = `${ Cypress.env('extensionVersion') || 'published' }`;
const DEV_LOADED = EXTENSION_VERSION === 'dev-load';
// The install modal defaults to the newest published version, which is what an
// undefined version leaves it on.
const PINNED_VERSION = ['dev-load', 'published'].includes(EXTENSION_VERSION) ? undefined : EXTENSION_VERSION;
const HELM_REPO_URL = 'https://rancher.github.io/virtual-clusters-ui';
const HELM_REPO_NAME = 'virtual-clusters-ui';

// UIPlugin created by a catalog install is named after the chart
const UI_PLUGIN_ID = 'cattle-ui-plugin-system/virtual-clusters';

// The install sets both images to SUSE's registry. A public default would still install,
// so the test pins them rather than only asserting success.
const SUSE_REGISTRY = 'registry.suse.com';

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
// The agent connects shortly after the cluster goes active - ~5 min at 1.5s per poll.
const CLUSTER_CONNECTED_RETRIES = 200;
const K3K_DEPLOYED_RETRIES = 20;
const POLICY_RESOURCE = 'k3k.io.virtualclusterpolicies';

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
  let removeK3k = false;

  const extensionsPage = new ExtensionsPagePo();
  let landingPage: VirtualClustersLandingPagePo;
  let policyListPage: VirtualClustersPolicyListPagePo;

  /** Provision the downstream host cluster the virtual clusters will live in. */
  function provisionHostCluster() {
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

      waitForClusterActive(CLUSTER_NAMESPACE, name, CLUSTER_ACTIVE_RETRIES).should('eq', true);

      clusterIdByName(name).then((id) => {
        hostClusterId = id;
        landingPage = new VirtualClustersLandingPagePo(id);
        policyListPage = new VirtualClustersPolicyListPagePo(id);

        // Being active is not enough to browse to /c/<id>/explorer: the dashboard
        // redirects to /dashboard/home until the cluster's agent is connected.
        waitForClusterConnected(id, CLUSTER_CONNECTED_RETRIES).should('eq', true);
      });
    });
  }

  /**
   * Add the chart repository and install the extension from it.
   */
  function installPublishedExtension() {
    removeRepo = true;
    removeExtension = true;

    extensionsPage.addHelmRepository(HELM_REPO_URL, HELM_REPO_NAME);

    extensionsPage.goTo();
    extensionsPage.waitForPage();
    extensionsPage.installExtensionFromCatalog(EXTENSION_NAME, HELM_REPO_NAME, 'vcInstall', PINNED_VERSION);
  }

  function waitForK3kReady() {
    waitForResourceState(
      `k8s/clusters/${ hostClusterId }/v1`, `catalog.cattle.io.apps/${ K3K_NAMESPACE }`, K3K_CHART_NAME,
      'deployed', K3K_DEPLOYED_RETRIES
    );
    waitForSchema(hostClusterId, K3K_POLICY_TYPE, K3K_DEPLOYED_RETRIES);
  }

  before(() => {
    loginAsAdmin();
    assertRancherPrime();

    provisionHostCluster();

    if (!DEV_LOADED) {
      installPublishedExtension();
    }
  });
  describe('Virtual Clusters Landing Page - K3K install', () => {
    it('shows the Virtual Clusters navigation entry and landing page on the downstream cluster', () => {
      VirtualClustersLandingPagePo.navTo(hostClusterId);

      const landingPage = new VirtualClustersLandingPagePo(hostClusterId);

      landingPage.waitForPage();
      landingPage.title().should('be.visible');
    });

    it('installs the k3k controller with images from the SUSE registry', () => {
      cy.intercept('POST', '**/catalog.cattle.io.ClusterRepo/*?action=install').as('installK3k');

      VirtualClustersLandingPagePo.navTo(hostClusterId);
      landingPage.waitForPage();
      landingPage.installK3kButton().click();

      cy.wait('@installK3k', EXTRA_LONG_TIMEOUT_OPT).then(({ request, response }) => {
        removeK3k = true;

        const chart = request.body?.charts?.[0];

        expect(response?.statusCode, 'install request rejected').to.eq(201);
        expect(request.body?.namespace, 'install targets the k3k namespace').to.eq(K3K_NAMESPACE);
        expect(chart?.chartName, 'install targets the SUSE chart').to.eq(K3K_CHART_NAME);
        expect(chart?.values?.controller?.image?.registry, 'controller image registry').to.eq(SUSE_REGISTRY);
        expect(chart?.values?.agent?.shared?.image?.registry, 'kubelet image registry').to.eq(SUSE_REGISTRY);
      });

      landingPage.k3kSuccessMessageVisible().should('be.visible');

      // Wait for the k3k controller to be fully deployed and its CRDs to be available before proceeding.
      waitForK3kReady();
    });

    it('stops offering the install button once k3k-system is occupied', () => {
      VirtualClustersPolicyListPagePo.navTo(hostClusterId);

      policyListPage.waitForPage();
      policyListPage.waitForList();
      policyListPage.masthead().title().should('contain', POLICY_NAV_LABEL);
      landingPage.installK3kButton().self().should('not.exist');
    });
  });
  describe('Create Virtual Cluster Policy validation', () => {
    let policyName = '';

    before(() => {
      cy.createE2EResourceName('vc-policy').then((name: string) => {
        policyName = name;

        createResource(`k8s/clusters/${ hostClusterId }/v1`, POLICY_RESOURCE, {
          type:     'k3k.io.virtualclusterpolicy',
          metadata: { name },
          spec:     {
            allowedMode: 'Shared',
            sync:        { storageClasses: { enabled: true } }
          }
        }).its('status').should('eq', 201);
      });
    });

    it('Prevents creation of virtual policy with an empty name and shows the required-field error', () => {
      VirtualClusterPolicyPo.goToCreate(hostClusterId);
      const policyPo = new VirtualClusterPolicyPo(hostClusterId);

      policyPo.waitForPage();
      policyPo.name().self().focus().blur();
      policyPo.name().validationMessage().should('contain', '"Value" is required');
      policyPo.saveButton().expectToBeDisabled();
    });

    it('Validation Policies Form displays inline validation for a non-DNS-compliant name', () => {
      VirtualClusterPolicyPo.goToCreate(hostClusterId);
      const policyPo = new VirtualClusterPolicyPo(hostClusterId);

      policyPo.waitForPage();
      policyPo.name().set('Invalid Name_!');
      policyPo.name().self().blur();
      policyPo.name().validationMessage().should('not.be.empty');
      policyPo.saveButton().expectToBeDisabled();
    });

    it('Keeps the name read-only when editing a policy', () => {
      VirtualClusterPolicyPo.goToEdit(hostClusterId, policyName);
      const policyPo = new VirtualClusterPolicyPo(hostClusterId, policyName);

      policyPo.waitForPage();
      policyPo.name().expectToBeDisabled();
      policyPo.name().value().should('eq', policyName);
    });

    it('Rejects a CPU request larger than the CPU limit before submission', () => {
      VirtualClusterPolicyPo.goToCreate(hostClusterId);
      const policyPo = new VirtualClusterPolicyPo(hostClusterId);

      policyPo.waitForPage();
      policyPo.name().set('cpu-validation-policy');
      policyPo.resourceAllocationTab().click();
      policyPo.cpuLimit().setValue('1');
      policyPo.cpuRequest().setValue('2');

      policyPo.errorBanner().should('be.visible').and('contain', 'CPU');
      policyPo.saveButton().expectToBeDisabled();
    });

    after(() => {
      if (policyName) {
        deleteResource(`k8s/clusters/${ hostClusterId }/v1`, POLICY_RESOURCE, policyName);
      }
    });
  });

  describe('Uninstall Virtual Clusters Extension', () => {
    // Nothing to uninstall when the extension was developer-loaded rather than installed.
    (DEV_LOADED ? it.skip : it)('uninstalls the extension and removes the navigation entry', () => {
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
  });

  after('clean up', () => {
    if (removeK3k) {
      uninstallK3k(hostClusterId);
    }
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
