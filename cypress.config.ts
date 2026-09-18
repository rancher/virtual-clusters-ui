import { extendConfig } from '@rancher/cypress/extend-config';

if (!process.env.TEST_BASE_URL) {
  throw new Error('TEST_BASE_URL must be set to the Rancher instance to test against');
}

// TEST_BASE_URL is the Rancher instance itself (same as API env var)
// baseUrl for cypress tests will need to include /dashboard unless the UI is running locally
let baseUrl = process.env.TEST_BASE_URL.replace(/\/$/, '');
const localDevHosts = ['localhost', '127.0.0.1'];
const isLocalDevServer = localDevHosts.includes(new URL(baseUrl).hostname);

if (!baseUrl.endsWith('/dashboard') && !isLocalDevServer) {
  baseUrl += '/dashboard';
}

export default extendConfig({
  env: {
    extensionUrl: process.env.EXTENSION_URL,
    // Jenkins sets TEST_JENKINS=true. Tests that provision real cloud infrastructure
    // (e.g. an EC2 host cluster for virtual clusters) gate on this and skip themselves
    // elsewhere, so they stay out of the GitHub PR gate and local runs.
    jenkins:      process.env.TEST_JENKINS === 'true',
    // Outside Jenkins, name an existing downstream cluster to run those tests
    // against it instead of provisioning one (it is left in place afterwards).
    hostCluster:  process.env.TEST_HOST_CLUSTER,
  },
  e2e: {
    baseUrl,
    specPattern: 'cypress/e2e/tests/**/*.spec.ts',
  }
});
