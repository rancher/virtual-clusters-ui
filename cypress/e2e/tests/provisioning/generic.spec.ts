import ClusterManagerCreatePagePo from '@rancher/cypress/e2e/po/edit/provisioning.cattle.io.cluster/create/cluster-create.po';

import { K3K_MAX_VERSION, K3K_REPO_NAME } from '../../../../pkg/virtual-clusters/utils/k3k-chart';
import CruK3kPo from '../../po/cru-k3k.po';
import {
  stubK3kInstalled, stubK3kInstallRequests, removeK3k, createK3kRepo, k3kChartFromIndex, waitForK3kDeployed,
  K3K_INSTALL_URL, K3K_OLDER_TAGS_KEY, K3K_REPO_URL_WITHOUT_CHARTS, K3K_VERSIONS
} from '../../utils/k3k-install';
import { HOST_CLUSTER, openCreateForm } from '../../utils/provisioning';
import {
  loginAsAdmin, clusterIdByName, deleteResource, uninstallK3k, createProject, createNamespace,
  createVirtualClusterPolicy, K3K_POLICY_TYPE, K3K_CLUSTER_TYPE, K3K_NAMESPACE, K3K_CHART_NAME
} from '../../utils/rancher-api';

const { NO_POLICY } = CruK3kPo;
// rancher downloads the repo index before the button sends the install request
const REPO_DOWNLOAD_TIMEOUT = 60000;
const RESOURCE_SYNC_SECTION = 'Resource Synchronization';
const TOPOLOGY_SECTION = 'Topology';

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

    cruK3k.ensureNoPolicy();
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


  // https://github.com/rancher/k3k/issues/1309
  describe('load balancer server port', { tags: ['@adminUser'] }, () => {
    const K3K_MODES = ['shared', 'virtual', 'hcp'] as const;
    let hostClusterId = '';

    before(() => {
      loginAsAdmin();

      clusterIdByName(HOST_CLUSTER).then((id) => {
        hostClusterId = id;
      });
    });

    function k3kAppRoute() {
      return { method: 'GET', pathname: `/k8s/clusters/${ hostClusterId }/v1/catalog.cattle.io.apps/${ K3K_NAMESPACE }/${ K3K_CHART_NAME }` };
    }

    // no appVersion fails the request, as for a user who cannot read the app
    function k3kAppResponse(appVersion?: string) {
      return appVersion ? { body: { spec: { chart: { metadata: { appVersion } } } } } : { statusCode: 404, body: {} };
    }

    // we need to wait for the request to fetch the k3k app made from the form
    // k3kVersionBanner will also fetch the app: if these requests are made very close together, they get batched into 1
    // so we can't just await the req to get the k3k app twice
    function openFormWithVersionReadHeld(appVersion?: string): { cruK3k: CruK3kPo, releaseVersionRead: () => void } {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = () => resolve();
      });

      cy.intercept(k3kAppRoute(), k3kAppResponse(appVersion)).as('k3kApp');

      // the form reads the k3k app only after this request resolves
      cy.intercept(
        { method: 'GET', pathname: `/k8s/clusters/${ hostClusterId }/v1/schemaDefinitions/${ K3K_CLUSTER_TYPE }` },
        (req) => held.then(() => req.continue())
      );

      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);

      // we know this is the request from the K3kVersionBanner because we've held the cluster schema request
      // that the form's k3k app request waits on
      cy.wait('@k3kApp');

      const releaseVersionRead = () => {
        // calling release() directly would run it before any queued command
        cy.then(() => release());

        // the form's k3k app request
        // once this reaches the browser several computed props will re-compute
        // that part is fast enough it doesn't need to be waited on, generally
        cy.wait('@k3kApp');
      };

      return { cruK3k, releaseVersionRead };
    }

    function showLoadBalancerInputs(cruK3k: CruK3kPo) {
      cruK3k.ensureNoPolicy();
      cruK3k.expandSection('Networking');
      cruK3k.expandSection('Direct API Server Exposure');
      cruK3k.exposeOption('Load Balancer').click();
    }

    function openLoadBalancerForm(appVersion?: string): CruK3kPo {
      const { cruK3k, releaseVersionRead } = openFormWithVersionReadHeld(appVersion);

      releaseVersionRead();
      showLoadBalancerInputs(cruK3k);

      return cruK3k;
    }

    K3K_MODES.forEach((mode) => {
      it(`disables the server port and shows a warning in ${ mode } mode when k3k is older than 1.3.0`, () => {
        const cruK3k = openLoadBalancerForm('v1.2.1');

        cruK3k.modeOption(mode).click();

        cruK3k.loadBalancerServerPortBanner().scrollIntoView().should('be.visible').and('contain', '1.3.0');
        cruK3k.loadBalancerServerPort().should('be.disabled');
        cruK3k.loadBalancerEtcdPort().should('be.enabled');
      });

      it(`allows a server port in ${ mode } mode when k3k is 1.3.0`, () => {
        const cruK3k = openLoadBalancerForm('v1.3.0');

        cruK3k.modeOption(mode).click();

        cruK3k.loadBalancerServerPort().should('be.enabled');
        cruK3k.loadBalancerServerPortBanner().should('not.exist');
      });
    });

    // k3k may not be installed yet, and a new install is >= 1.3.0
    it('allows a server port when the k3k version cannot be read', () => {
      const cruK3k = openLoadBalancerForm();

      cruK3k.loadBalancerServerPort().should('be.enabled');
      cruK3k.loadBalancerServerPortBanner().should('not.exist');
    });

    // the input is enabled until the form has read the version
    it('clears a server port typed before the k3k version is known', () => {
      const { cruK3k, releaseVersionRead } = openFormWithVersionReadHeld('v1.2.1');

      showLoadBalancerInputs(cruK3k);
      cruK3k.loadBalancerServerPort().type('6443');
      cruK3k.loadBalancerServerPort().should('have.value', '6443');

      releaseVersionRead();

      cruK3k.loadBalancerServerPort().should('be.disabled').and('have.value', '');
    });
  });

  describe('installing k3k from the Install K3k button', { tags: ['@adminUser'] }, () => {
    let hostClusterId = '';

    before(() => {
      loginAsAdmin();

      clusterIdByName(HOST_CLUSTER).then((id) => {
        hostClusterId = id;
      });
    });

    function clickInstallK3k(): CruK3kPo {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.installK3kButton().click();

      return cruK3k;
    }

    /**
     * Each test stubs the ClusterRepo, index and install responses for the state it needs.
     * Stubbed versions are relative to K3K_MAX_VERSION, which comes from the extension's package.json.
     */
    describe('with stubbed repo responses', () => {
      // the button polls the repo 11 times, 1s apart, before it gives up
      const POLLING_TIMEOUT = 20000;

      beforeEach(() => {
        stubK3kInstalled(hostClusterId, false);
      });

      it('installs the newest stable version at or below the extension major.minor', () => {
        stubK3kInstallRequests(hostClusterId, { index: { [K3K_CHART_NAME]: [K3K_VERSIONS.nextMinor, K3K_VERSIONS.prerelease, K3K_VERSIONS.supported, K3K_VERSIONS.olderSupported] } });

        const cruK3k = clickInstallK3k();

        cy.wait('@k3kInstall').its('request.body.charts.0').should('include', { chartName: K3K_CHART_NAME, version: K3K_VERSIONS.supported });
        cruK3k.installSucceeded().should('be.visible');
      });

      it('sends the index key of an older tag as the chart name', () => {
        stubK3kInstallRequests(hostClusterId, {
          index: {
            [K3K_CHART_NAME]:     [K3K_VERSIONS.nextMinor],
            [K3K_OLDER_TAGS_KEY]: [K3K_VERSIONS.supported, K3K_VERSIONS.olderSupported]
          }
        });

        clickInstallK3k();

        cy.wait('@k3kInstall').its('request.body.charts.0').should('include', {
          chartName: K3K_OLDER_TAGS_KEY, releaseName: K3K_CHART_NAME, version: K3K_VERSIONS.supported
        });
      });

      it('warns that the extension must be upgraded when every version is above the supported range', () => {
        stubK3kInstallRequests(hostClusterId, { index: { [K3K_CHART_NAME]: [K3K_VERSIONS.nextMajor], [K3K_OLDER_TAGS_KEY]: [K3K_VERSIONS.nextMinor] } });

        const cruK3k = clickInstallK3k();

        cruK3k.versionsTooHighBanner().should('be.visible').and('contain', 'Upgrade your Virtual Clusters UI extension to proceed');
        cy.get('@k3kInstall.all').should('have.length', 0);
      });

      it('reports an index with only prerelease versions at or below the supported range', () => {
        stubK3kInstallRequests(hostClusterId, { index: { [K3K_CHART_NAME]: [K3K_VERSIONS.nextMinor], [K3K_OLDER_TAGS_KEY]: [K3K_VERSIONS.prerelease] } });

        const cruK3k = clickInstallK3k();

        cruK3k.errorBanner().should('contain', `has only prerelease K3K versions at or below ${ K3K_MAX_VERSION }`);
        cy.get('@k3kInstall.all').should('have.length', 0);
      });

      it('reports an index with no valid semver versions', () => {
        stubK3kInstallRequests(hostClusterId, { index: { [K3K_CHART_NAME]: ['latest'] } });

        const cruK3k = clickInstallK3k();

        cruK3k.errorBanner().should('contain', 'index has no valid semver versions. Index versions: latest');
        cy.get('@k3kInstall.all').should('have.length', 0);
      });

      it('reports a repo download failure from rancher without polling again', () => {
        stubK3kInstallRequests(hostClusterId, { statuses: [{ downloaded: false, message: 'error 404: Not Found' }] });

        const cruK3k = clickInstallK3k();

        cruK3k.errorBanner().should('contain', `Error installing K3K: The ${ K3K_REPO_NAME } repository failed to download: error 404: Not Found`);
        cy.get('@k3kRepo.all').should('have.length', 1);
        cy.get('@k3kIndex.all').should('have.length', 0);
      });

      it('waits for rancher to process the applied repo spec before reading the index', () => {
        stubK3kInstallRequests(hostClusterId, {
          statuses: [{ processed: false }, { processed: false }, {}],
          index:    { [K3K_CHART_NAME]: [K3K_VERSIONS.supported] }
        });

        clickInstallK3k();

        cy.wait('@k3kInstall');
        cy.get('@k3kRepo.all').should('have.length', 3);
        cy.get('@k3kIndex.all').should('have.length', 1);
      });

      it('reports a repo that rancher does not process before polling ends', () => {
        stubK3kInstallRequests(hostClusterId, { statuses: [{ processed: false }] });

        const cruK3k = clickInstallK3k();

        cruK3k.errorBanner({ timeout: POLLING_TIMEOUT }).should('contain', `The ${ K3K_REPO_NAME } repository did not finish downloading.`);
        cy.get('@k3kRepo.all').should('have.length', 11);
        cy.get('@k3kIndex.all').should('have.length', 0);
      });
    });

    /**
     * Each test removes k3k and sets up the ClusterRepo state it needs, then installs k3k from registry.suse.com.
     * The extension's package.json version must be at or above the oldest k3k minor in the registry.
     */
    describe('from the k3k registry', () => {
      beforeEach(() => {
        removeK3k(hostClusterId);
      });

      function installK3kAndCheck() {
        cy.intercept({ method: 'POST', url: K3K_INSTALL_URL }).as('k3kInstall');

        const cruK3k = clickInstallK3k();

        cy.wait('@k3kInstall', { timeout: REPO_DOWNLOAD_TIMEOUT }).then(({ request, response }) => {
          expect(response?.statusCode, 'k3k install request').to.eq(201);

          k3kChartFromIndex(hostClusterId).then((chart) => {
            expect(chart, `a k3k chart at or below ${ K3K_MAX_VERSION } in the index`).to.not.eq(null);
            expect(request.body.charts[0]).to.include({
              chartName: chart?.name, releaseName: K3K_CHART_NAME, version: chart?.version
            });
          });
        });

        cruK3k.installSucceeded().should('be.visible');
        waitForK3kDeployed(hostClusterId);
      }

      it('installs k3k when the cluster has no k3k repo', () => {
        installK3kAndCheck();
      });

      // the button applies the correct spec, so it must wait for rancher to process that spec
      it('installs k3k when the k3k repo exists but has not downloaded', () => {
        createK3kRepo(hostClusterId, K3K_REPO_URL_WITHOUT_CHARTS).should('eq', 'False');

        installK3kAndCheck();
      });

      it('installs k3k when the k3k repo exists and has downloaded', () => {
        createK3kRepo(hostClusterId).should('eq', 'True');

        installK3kAndCheck();
      });

      after(() => {
        uninstallK3k(hostClusterId);
      });
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

    // 'No policy' is stored as an empty policy object, which must count as no policy
    // the installed k3k version is the newest, which supports the Topology fields
    it('offers the scheduling configuration when no policy is selected', () => {
      const cruK3k = openCreateForm();

      cruK3k.selectHostCluster(HOST_CLUSTER);
      cruK3k.waitForPolicyLoad();
      cruK3k.policySelect().checkContainsOptionSelected(policyName);

      cruK3k.tocTopLevelLabels().should('not.include', TOPOLOGY_SECTION);
      cruK3k.nodeSelectorTitle().should('not.exist');

      cruK3k.selectPolicy(NO_POLICY);

      cruK3k.tocTopLevelLabels().should('include', TOPOLOGY_SECTION);
      cruK3k.nodeSelectorTitle().should('be.visible');

      cruK3k.modeOption('hcp').click();
      cruK3k.expandSection(TOPOLOGY_SECTION).within(() => {
        cy.contains('Server Scheduling').should('be.visible');
      });
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
