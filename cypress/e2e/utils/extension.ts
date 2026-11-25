import ExtensionsPagePo from '../po/extensions-page.po';
import { apiRequest, deleteResource, rancherVersion, waitForResource } from './rancher-api';

export const EXTENSION_NAME = 'Virtual Clusters';
// Which build of the extension to test:
//   'published' - install the newest published version from the chart repo, GA or rc (default)
//   'dev-load'  - CI builds it from this checkout and developer-loads it before Cypress
//                 starts, so there is no chart repo to add and nothing to install or
//                 uninstall here. The only way to reach selectors that are on main but
//                 not yet in a published chart.
//   <version>   - install that exact published version, e.g. '1.2.1' or '1.2.1-rc1'
export const EXTENSION_VERSION = `${ Cypress.env('extensionVersion') || 'published' }`;
export const DEV_LOADED = EXTENSION_VERSION === 'dev-load';
// The install modal defaults to the newest published version, which is what an
// undefined version leaves it on.
export const PINNED_VERSION = ['dev-load', 'published'].includes(EXTENSION_VERSION) ? undefined : EXTENSION_VERSION;
export const HELM_REPO_URL = 'https://rancher.github.io/virtual-clusters-ui';
export const HELM_REPO_NAME = 'virtual-clusters-ui';

// UIPlugin created by a catalog install is named after the chart
export const UI_PLUGIN_ID = 'cattle-ui-plugin-system/virtual-clusters';
// ...and so is the helm release behind it. Deleting the UIPlugin alone leaves this release
// deployed, and it recreates the UIPlugin as soon as the chart repo is added back.
export const EXTENSION_APP_ID = 'cattle-ui-plugin-system/virtual-clusters';

// The extension is Prime-only (catalog.cattle.io/prime-only) and every product it
// registers is hidden behind isRancherPrime(), so fail fast with a clear message
// rather than timing out on a missing card later.
export function assertRancherPrime() {
  rancherVersion().then((version) => {
    expect(
      version.RancherPrime?.toLowerCase(),
      `${ EXTENSION_NAME } is Prime-only, but /rancherversion reports RancherPrime=${ version.RancherPrime }`
    ).to.eq('true');
  });
}

/** What ensureExtensionInstalled created, so the caller can remove exactly that in teardown. */
export interface ExtensionSetup {
  repoAdded: boolean;
  extensionInstalled: boolean;
}

export function emptyExtensionSetup(): ExtensionSetup {
  return { repoAdded: false, extensionInstalled: false };
}

function resourceExists(resourceType: string, id: string): Cypress.Chainable<boolean> {
  return apiRequest({ url: `/v1/${ resourceType }/${ id }`, failOnStatusCode: false }).then((resp) => resp.status === 200);
}

/**
 * Install the extension from the published chart repo unless it is already there.
 *
 * For specs that need the extension but do not test installing it. Under Jenkins the
 * extension lifecycle spec uninstalls it when it finishes, so a spec running after it
 * cannot assume it is present. Developer-loaded builds are never touched.
 *
 * `setup` is filled in before each step rather than returned at the end, so teardown
 * still removes a repo or release left behind by an install that failed half way.
 */
export function ensureExtensionInstalled(setup: ExtensionSetup) {
  if (DEV_LOADED) {
    return;
  }

  resourceExists('catalog.cattle.io.apps', EXTENSION_APP_ID).then((installed) => {
    if (installed) {
      return;
    }

    const extensionsPage = new ExtensionsPagePo();

    resourceExists('catalog.cattle.io.clusterrepos', HELM_REPO_NAME).then((repoExists) => {
      if (!repoExists) {
        setup.repoAdded = true;
        extensionsPage.addHelmRepository(HELM_REPO_URL, HELM_REPO_NAME);
      }

      cy.then(() => {
        setup.extensionInstalled = true;
      });
      extensionsPage.goTo();
      extensionsPage.waitForPage();
      extensionsPage.installExtensionFromCatalog(EXTENSION_NAME, HELM_REPO_NAME, 'vcInstall', PINNED_VERSION);
    });
  });
}

/** Remove only what ensureExtensionInstalled added. */
export function removeExtensionSetup(setup: ExtensionSetup) {
  if (setup.extensionInstalled) {
    // uninstall the helm release, as the Extensions page does; that also removes the UIPlugin
    apiRequest({
      method:           'POST',
      url:              `/v1/catalog.cattle.io.apps/${ EXTENSION_APP_ID }?action=uninstall`,
      body:             {},
      failOnStatusCode: false,
    });
    waitForResource('v1', 'catalog.cattle.io.apps', EXTENSION_APP_ID, (resp) => resp.status === 404).then((removed) => {
      expect(removed, `the ${ EXTENSION_NAME } helm release was not uninstalled`).to.eq(true);
    });
  }
  if (setup.repoAdded) {
    deleteResource('v1', 'catalog.cattle.io.clusterrepos', HELM_REPO_NAME);
  }
}
