import { HOST_CLUSTER, openCreateForm } from '../../utils/provisioning';
import { apiRequest, loginAsAdmin } from '../../utils/rancher-api';

const LOCAL_CLUSTER = 'local';
const HIDE_LOCAL_SETTING = 'hide-local-cluster';

// TODO nb review
// mirrors localDevHosts in cypress.config.ts
const DEV_SERVER_HOSTS = ['localhost', '127.0.0.1'];

function setHideLocalCluster(value: string) {
  return apiRequest({
    method: 'PUT',
    url:    `/v3/settings/${ HIDE_LOCAL_SETTING }`,
    body:   { name: HIDE_LOCAL_SETTING, value },
  }).then((resp) => {
    expect(resp.status, `set ${ HIDE_LOCAL_SETTING } to '${ value }'`).to.eq(200);
  });
}

// TODO nb review
// mirrors INCLUDE_LOCAL in pkg/virtual-clusters/components/InstallK3k.vue
// the dev server builds the extension with process.env.dev set
function localClusterIsOffered(): Cypress.Chainable<boolean> {
  return cy.readFile('pkg/virtual-clusters/package.json').then((pkg: { version: string }) => {
    const isDevServer = DEV_SERVER_HOSTS.includes(new URL(Cypress.config('baseUrl') as string).hostname);

    return isDevServer || /-dev[0-9A-Za-z.]*$/.test(pkg.version);
  });
}

describe('host cluster list', { tags: ['@adminUser'] }, () => {
  let originalHideLocal = '';

  before(() => {
    loginAsAdmin();

    apiRequest({ url: `/v3/settings/${ HIDE_LOCAL_SETTING }` }).then((resp) => {
      originalHideLocal = resp.body?.value || '';
    });
  });

  beforeEach(() => {
    loginAsAdmin();
  });

  it('does not offer the local cluster while hide-local-cluster is on', () => {
    setHideLocalCluster('true');

    const cruK3k = openCreateForm();

    cruK3k.hostClusterOptionLabels().should('include', HOST_CLUSTER).and('not.include', LOCAL_CLUSTER);
  });

  it('offers the local cluster only to dev builds and -dev versions while hide-local-cluster is off', () => {
    setHideLocalCluster('false');

    localClusterIsOffered().then((offered) => {
      const cruK3k = openCreateForm();

      cruK3k.hostClusterOptionLabels().should('include', HOST_CLUSTER).and(offered ? 'include' : 'not.include', LOCAL_CLUSTER);
    });
  });

  after('restore hide-local-cluster', () => {
    setHideLocalCluster(originalHideLocal);
  });
});
