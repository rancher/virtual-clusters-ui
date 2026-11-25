import ClusterManagerListPagePo from '@rancher/cypress/e2e/po/pages/cluster-manager/cluster-manager-list.po';
import NotFoundPagePo from '@rancher/cypress/e2e/po/pages/not-found-page.po';
import { LONG_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';
import VirtualClustersLandingPagePo from '../../po/virtual-clusters-landing.po';
import { assertRancherPrime, emptyExtensionSetup, ensureExtensionInstalled, removeExtensionSetup } from '../../utils/extension';
import { stubK3kInstalled } from '../../utils/k3k-install';
import { loginAsAdmin } from '../../utils/rancher-api';

const LOCAL_CLUSTER = 'local';
const LOCAL_NOTICE = 'Installing k3k in the local Rancher cluster is not recommended';

// test plan VC-UI-17: guard rails on the local cluster, where installing k3k is not supported
// regression coverage for https://github.com/rancher/virtual-clusters-ui/issues/62 (Cluster Management link was a 404)
//
// Tagged @jenkins: it runs in the Jenkins matrix against the published extension, which the
// lifecycle spec uninstalls when it finishes, so this spec installs it again when missing.
// Published releases up to 1.3.0-rc2 predate the landing page's k3k-landing-notice test ids,
// so the notice is located by its text instead.
describe('virtual clusters on the local cluster', { tags: ['@adminUser', '@jenkins', '@localcluster'] }, () => {
  const setup = emptyExtensionSetup();
  let landingPage: VirtualClustersLandingPagePo;

  const notice = (options?: Partial<Cypress.Timeoutable>) => cy.contains(LOCAL_NOTICE, options);
  const noticeLink = () => notice().find('a').contains('Cluster Management');

  before(() => {
    loginAsAdmin();
    assertRancherPrime();

    ensureExtensionInstalled(setup);
  });

  beforeEach(() => {
    loginAsAdmin();

    // the landing page redirects to the policy list when k3k is installed, so force the "not installed" state
    stubK3kInstalled(LOCAL_CLUSTER, false);

    // open the page by URL rather than through the side nav: Rancher 2.16 renders the Virtual
    // Clusters entry on local as a plain link, not the group that ProductNavPo looks for
    VirtualClustersLandingPagePo.goTo(LOCAL_CLUSTER);
    landingPage = new VirtualClustersLandingPagePo(LOCAL_CLUSTER);
    landingPage.waitForPage();
    // a freshly installed extension can take a while to load on a busy instance
    notice(LONG_TIMEOUT_OPT).should('be.visible');
  });

  it('does not offer to install k3k', () => {
    // wait for the page to finish loading before asserting that the button is absent
    notice().should('be.visible');

    landingPage.installK3kButton().self().should('not.exist');
  });

  it('shows a warning that installing k3k on the local cluster is not recommended', () => {
    notice()
      .should('be.visible')
      .and('contain', 'to import an existing cluster or provision a new one');

    noticeLink().should('be.visible');
  });

  it('navigates to the Cluster Management cluster list from the warning link instead of a 404', () => {
    noticeLink().should('have.attr', 'href').and('match', /\/manager\/provisioning\.cattle\.io\.cluster$/);

    noticeLink().click();

    // #62: the link used to resolve to /c/_/manager, which has no resource type and renders the 404 page
    cy.location('pathname').should('match', /\/c\/[^/]+\/manager\/provisioning\.cattle\.io\.cluster$/);

    const clusterList = new ClusterManagerListPagePo();

    clusterList.list().checkVisible();
    clusterList.sortableTable().rowElementWithName(LOCAL_CLUSTER).should('be.visible');
    new NotFoundPagePo('').errorTitle().should('not.exist');
  });

  after('clean up', () => {
    if (!setup.extensionInstalled && !setup.repoAdded) {
      return;
    }

    // the teardown calls the API, which needs a session; when a hook fails and its retries run
    // out, Cypress clears the session before this hook, so log in again rather than assume one
    loginAsAdmin();
    removeExtensionSetup(setup);
  });
});
