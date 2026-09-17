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
  env: { extensionUrl: process.env.EXTENSION_URL },
  e2e: {
    baseUrl,
    specPattern: 'cypress/e2e/tests/**/*.spec.ts',
  }
});
