import VirtualClustersLandingPagePo from '../../po/virtual-clusters-landing.po';
import VirtualClustersPolicyListPagePo from '../../po/virtual-clusters-policy-list.po';
import { stubK3kInstalled, stubK3kInstallRequests, K3K_OLDER_TAGS_KEY, K3K_VERSIONS } from '../../utils/k3k-install';
import { HOST_CLUSTER } from '../../utils/provisioning';
import { loginAsAdmin, clusterIdByName, K3K_CHART_NAME, PARENT_CLUSTER_ANNOTATION } from '../../utils/rancher-api';

// landing page shown in the virtual clusters cluster explorer product, before k3k is installed
describe('virtual clusters landing page', () => {
  let hostClusterId = '';

  before(() => {
    loginAsAdmin();

    clusterIdByName(HOST_CLUSTER).then((id) => {
      hostClusterId = id;
    });
  });

  beforeEach(() => {
    loginAsAdmin();
  });

  describe('on a cluster that cannot host virtual clusters', { tags: ['@adminUser'] }, () => {
    it('explains that the local cluster cannot host virtual clusters and links to cluster management', () => {
      stubK3kInstalled('local', false);

      VirtualClustersLandingPagePo.navTo('local');
      const landingPage = new VirtualClustersLandingPagePo('local');

      landingPage.notice().should('contain', 'Installing k3k in the local Rancher cluster is not recommended');
      landingPage.noticeLink().should('have.attr', 'href').and('include', '/manager/provisioning.cattle.io.cluster');
      landingPage.installK3kButton().self().should('not.exist');
    });

    it('explains that a virtual cluster cannot host virtual clusters and links to the non-virtual clusters', () => {
      stubK3kInstalled(hostClusterId, false);

      // mocking the parent cluster annotation tells the ui this cluster is a virtual cluster
      cy.intercept({ method: 'GET', url: new RegExp(`/v1/provisioning\\.cattle\\.io\\.clusters/[^/?]+/${ HOST_CLUSTER }(\\?|$)`) }, (req) => {
        req.continue((res) => {
          res.body.metadata.annotations = { ...res.body.metadata.annotations, [PARENT_CLUSTER_ANNOTATION]: 'c-m-parent' };
        });
      });

      VirtualClustersLandingPagePo.navTo(hostClusterId);
      const landingPage = new VirtualClustersLandingPagePo(hostClusterId);

      landingPage.notice().should('contain', 'Installing virtual clusters within virutal clusters in not currently supported');
      landingPage.noticeLink().should('have.attr', 'href').and('include', 'q=!virtual');
      landingPage.installK3kButton().self().should('not.exist');
    });
  });

  describe('on a host cluster without k3k', () => {
    let landingPage: VirtualClustersLandingPagePo;

    beforeEach(() => {
      stubK3kInstalled(hostClusterId, false);
      landingPage = new VirtualClustersLandingPagePo(hostClusterId);
    });

    it('tells a user who cannot install k3k that an admin must install it', { tags: ['@adminUser', '@standardUser'] }, () => {
      // simulate a user who can only GET namespaces
      cy.intercept({ method: 'GET', pathname: `/k8s/clusters/${ hostClusterId }/v1/schemas/namespace` }, (req) => {
        req.continue((res) => {
          res.body.collectionMethods = ['GET'];
        });
      });

      VirtualClustersLandingPagePo.navTo(hostClusterId);

      landingPage.notice().should('contain', 'you might not have sufficient permissions').and('contain', 'Contact your cluster administrator');
      landingPage.installK3kButton().self().should('not.exist');
    });

    it('shows the quick guide with an Install K3k button in the first step', { tags: ['@adminUser'] }, () => {
      VirtualClustersLandingPagePo.navTo(hostClusterId);

      landingPage.quickGuideSteps().should('have.length', 3);
      landingPage.quickGuideSteps().first().find('[data-testid="install-k3k-button"]').should('be.visible');
    });

    it('installs the newest stable version at or below the extension major.minor and confirms the install', { tags: ['@adminUser'] }, () => {
      stubK3kInstallRequests(hostClusterId, {
        index: {
          [K3K_CHART_NAME]:     [K3K_VERSIONS.nextMinor],
          [K3K_OLDER_TAGS_KEY]: [K3K_VERSIONS.prerelease, K3K_VERSIONS.supported, K3K_VERSIONS.olderSupported]
        }
      });

      VirtualClustersLandingPagePo.navTo(hostClusterId);
      landingPage.installK3kButton().click();

      cy.wait('@k3kInstall').its('request.body.charts.0').should('include', { chartName: K3K_OLDER_TAGS_KEY, version: K3K_VERSIONS.supported });
      landingPage.installSucceeded().should('be.visible');
    });

    it('warns that the extension must be upgraded when every version is above the supported range', { tags: ['@adminUser'] }, () => {
      stubK3kInstallRequests(hostClusterId, { index: { [K3K_CHART_NAME]: [K3K_VERSIONS.nextMajor], [K3K_OLDER_TAGS_KEY]: [K3K_VERSIONS.nextMinor] } });

      VirtualClustersLandingPagePo.navTo(hostClusterId);
      landingPage.installK3kButton().click();

      landingPage.versionsTooHighBanner().should('be.visible').and('contain', 'Upgrade your Virtual Clusters UI extension to proceed');
      cy.get('@k3kInstall.all').should('have.length', 0);
    });
  });

  it('redirects to the virtual cluster policy list when the host cluster has k3k', { tags: ['@adminUser'] }, () => {
    stubK3kInstalled(hostClusterId, true);

    VirtualClustersLandingPagePo.navTo(hostClusterId);

    new VirtualClustersPolicyListPagePo(hostClusterId).waitForPage();
  });
});
