/**
 * Minimal Rancher API helpers.
 *
 * @rancher/cypress ships equivalents (cy.getRancherResource, cy.waitForResourceState,
 * cy.createAmazonRke2Cluster, ...) but every one of them reads a module-private `token`
 * that cy.login() only assigns on its `cacheSession: true` branch. That branch runs the
 * login inside cy.session(), whose setup asserts the login page shows "Welcome to
 * Rancher" - a message Rancher only renders before it has been bootstrapped. Every
 * instance this suite runs against is already bootstrapped and shows "Login", so the
 * cached branch cannot be used here, `token` stays undefined and those commands throw
 * `TypeError: Cannot read properties of undefined (reading 'value')`.
 *
 * The uncached branch (what loginAsAdmin below uses) logs in fine but never sets `token`,
 * so these helpers read the CSRF cookie themselves instead.
 * TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
 */
import { LoginPagePo } from '@rancher/cypress/e2e/po/pages/login-page.po';

const api = () => Cypress.env('api');

/**
 * Log in through the UI without cy.session(), navigating ourselves so that
 * cy.login()'s bootstrapped-only "Welcome to Rancher" assertion is skipped.
 */
export function loginAsAdmin() {
  LoginPagePo.goTo();
  new LoginPagePo().checkIsCurrentPage();

  return cy.login(undefined, undefined, false, true);
}

/**
 * Rancher rejects mutating requests without the CSRF header. The cookie is set by login.
 */
function csrf(): Cypress.Chainable<string> {
  return cy.getCookie('CSRF').then((cookie) => {
    expect(cookie, 'CSRF cookie - is the session logged in?').to.not.be.null;

    return cookie!.value;
  });
}

function apiRequest(options: Partial<Cypress.RequestOptions> & { url: string }): Cypress.Chainable<Cypress.Response<any>> {
  return csrf().then((value) => cy.request({
    ...options,
    url:     `${ api() }${ options.url }`,
    headers: {
      'x-api-csrf': value,
      Accept:       'application/json',
      ...(options.headers || {}),
    },
  }));
}

/** /rancherversion is public, so this also works before logging in. */
export function rancherVersion(): Cypress.Chainable<{ Version: string, RancherPrime: string }> {
  return cy.request({ url: `${ api() }/rancherversion` })
    .then((resp) => (typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body));
}

/** Resolves a downstream cluster's management id (c-m-xxxxxxxx), used in /c/<id>/ URLs. */
export function clusterIdByName(name: string): Cypress.Chainable<string> {
  return apiRequest({ url: '/v3/clusters' }).then((resp) => {
    const cluster = resp.body.data.find((c: any) => c.name === name);

    expect(cluster, `downstream cluster '${ name }' not found in this Rancher`).to.not.be.undefined;

    return cluster.id;
  });
}

/**
 * Poll a resource until `testFn` accepts the response. Returns false if it never does,
 * so callers can assert with their own message. A 404 is passed through to `testFn`,
 * which lets callers retry while a freshly created resource appears.
 */
export function waitForResource(
  prefix: string,
  resourceType: string,
  id: string,
  testFn: (resp: Cypress.Response<any>) => boolean,
  retries = 20
): Cypress.Chainable<boolean> {
  const check = (remaining: number): Cypress.Chainable<boolean> => {
    return apiRequest({
      url:              `/${ prefix }/${ resourceType }/${ id }`,
      failOnStatusCode: false,
    }).then((resp) => {
      if (testFn(resp)) {
        return cy.wrap(true, { log: false });
      }
      if (remaining <= 1) {
        return cy.wrap(false, { log: false });
      }
      cy.wait(1500); // eslint-disable-line cypress/no-unnecessary-waiting

      return check(remaining - 1);
    });
  };

  return check(retries);
}

/** Poll until a resource settles on `state` (not transitioning). */
export function waitForResourceState(prefix: string, resourceType: string, id: string, state = 'active', retries = 20) {
  return waitForResource(prefix, resourceType, id, (resp) => {
    const current = resp.status === 200 ? resp.body?.metadata?.state : undefined;

    return current?.transitioning === false && current?.name === state;
  }, retries);
}

/** Poll until a ClusterRepo reports its chart index as Downloaded. */
export function waitForRepositoryDownload(name: string, retries = 20) {
  return waitForResource('v1', 'catalog.cattle.io.clusterrepos', name, (resp) => {
    const conditions = resp.body?.status?.conditions || [];

    return conditions.some((c: { type: string, status: string }) => c.type === 'Downloaded' && c.status === 'True');
  }, retries);
}

/** True when `conditions` holds `type` with status True. */
function conditionIsTrue(conditions: { type: string, status: string }[], type: string) {
  return conditions.some((c) => c.type === type && c.status === 'True');
}

/**
 * Poll a provisioning cluster until it settles on `active`.
 *
 * Not waitForResourceState: Steve reports `state: { name: 'active', transitioning: false }`
 * for a resource whose controllers have not written any status yet, so a cluster created
 * seconds ago looks active on the very first poll and the caller carries on against a
 * cluster that is still provisioning. Require the status to exist, and `Ready` to be
 * True, before trusting the state.
 */
export function waitForClusterActive(namespace: string, name: string, retries: number) {
  return waitForResource('v1', `provisioning.cattle.io.clusters/${ namespace }`, name, (resp) => {
    if (resp.status !== 200) {
      return false;
    }

    const conditions = resp.body?.status?.conditions || [];

    if (!conditions.length || !conditionIsTrue(conditions, 'Ready')) {
      return false;
    }

    const state = resp.body?.metadata?.state;

    return state?.transitioning === false && state?.name === 'active';
  }, retries);
}

/**
 * Poll the management cluster (the `c-m-xxxxxxxx` one `/c/<id>/` URLs address) until it
 * is active with its agent connected. A provisioning cluster reaches `active` slightly
 * before the downstream agent connects, and until it does the dashboard cannot load the
 * cluster and bounces `/c/<id>/explorer` back to `/dashboard/home`.
 */
export function waitForClusterConnected(id: string, retries: number) {
  return waitForResource('v3', 'clusters', id, (resp) => {
    if (resp.status !== 200) {
      return false;
    }

    const conditions = resp.body?.conditions || [];

    return resp.body?.state === 'active' && conditionIsTrue(conditions, 'Ready');
  }, retries);
}

/** Best-effort delete used in teardown - a missing resource is not an error. */
export function deleteResource(prefix: string, resourceType: string, id: string) {
  return apiRequest({
    method:           'DELETE',
    url:              `/${ prefix }/${ resourceType }/${ id }`,
    failOnStatusCode: false,
  });
}

export interface AwsHostClusterParams {
  name: string;
  namespace: string;
  region: string;
  accessKey: string;
  secretKey: string;
  instanceType: string;
  vpcId: string;
  zone: string;
}

/**
 * Provision an RKE2 cluster on EC2 to host the virtual clusters, mirroring
 * @rancher/cypress's cy.createAmazonRke2Cluster: cloud credential -> machine config ->
 * provisioning cluster, on the RKE2 version this Rancher defaults to.
 */
export function createAwsHostCluster(params: AwsHostClusterParams) {
  const {
    name, namespace, region, accessKey, secretKey, instanceType, vpcId, zone
  } = params;

  return apiRequest({
    method: 'POST',
    url:    '/v3/cloudcredentials',
    body:   {
      type:                      'provisioning.cattle.io/cloud-credential',
      metadata:                  { generateName: 'cc-', namespace },
      _name:                     name,
      annotations:               { 'provisioning.cattle.io/driver': 'aws' },
      amazonec2credentialConfig: {
        defaultRegion: region, accessKey, secretKey
      },
      _type: 'provisioning.cattle.io/cloud-credential',
      name,
    },
  }).then((credResp) => {
    expect(credResp.status, 'create cloud credential').to.eq(201);
    const cloudCredentialSecretName = credResp.body.id;

    return apiRequest({
      method: 'POST',
      url:    `/v1/rke-machine-config.cattle.io.amazonec2configs/${ namespace }`,
      body:   {
        instanceType,
        metadata: {
          annotations: {}, generateName: `nc-${ name }-pool1-`, labels: {}, namespace
        },
        region,
        securityGroup:         ['rancher-nodes'],
        securityGroupReadonly: false,
        subnetId:              null,
        vpcId,
        zone,
        type:                  'rke-machine-config.cattle.io.amazonec2config',
      },
    }).then((mcResp) => {
      expect(mcResp.status, 'create machine config').to.eq(201);
      const machineConfigName = String(mcResp.body.id).split('/')[1];

      // Use the version this Rancher itself defaults to, not the newest release KDM
      // publishes: KDM ships new RKE2 minors before Rancher can provision them, and
      // picking the last entry of /v1-rke2-release/releases yields a cluster whose
      // rke2-server never starts. The setting's value has no leading `v`.
      return apiRequest({ url: '/v1/management.cattle.io.settings/rke2-default-version' }).then((verResp) => {
        const kubernetesVersion = `v${ verResp.body.value }`;

        return apiRequest({
          method: 'POST',
          url:    '/v1/provisioning.cattle.io.clusters',
          body:   {
            type:     'provisioning.cattle.io.cluster',
            metadata: {
              namespace,
              name,
              annotations: { 'field.cattle.io/description': `${ name }-description` },
            },
            spec: {
              rkeConfig: {
                chartValues:         { 'rke2-calico': {} },
                machineGlobalConfig: {
                  cni:                   'calico',
                  'disable-kube-proxy':  false,
                  'etcd-expose-metrics': false,
                  'ingress-controller':  'ingress-nginx',
                },
                machineSelectorConfig: [{ config: { 'protect-kernel-defaults': false } }],
                etcd:                  {
                  disableSnapshots:     false,
                  s3:                   null,
                  snapshotRetention:    5,
                  snapshotScheduleCron: '0 */5 * * *',
                },
                registries:   { configs: {}, mirrors: {} },
                machinePools: [{
                  name:                 'pool1',
                  etcdRole:             true,
                  controlPlaneRole:     true,
                  workerRole:           true,
                  hostnamePrefix:       '',
                  labels:               {},
                  quantity:             1,
                  unhealthyNodeTimeout: '0m',
                  machineConfigRef:     { kind: 'Amazonec2Config', name: machineConfigName },
                  drainBeforeDelete:    true,
                }],
              },
              machineSelectorConfig:                                [{ config: {} }],
              kubernetesVersion,
              defaultPodSecurityAdmissionConfigurationTemplateName: '',
              cloudCredentialSecretName,
              localClusterAuthEndpoint:                             {
                enabled: false, caCerts: '', fqdn: ''
              },
            },
          },
        }).then((resp) => {
          expect(resp.status, 'create provisioning cluster').to.eq(201);
        });
      });
    });
  });
}
