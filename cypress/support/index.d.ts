declare namespace Cypress {
  interface Chainable {
    /**
     * Install k3k into a host cluster through the Rancher API, unless k3k-system already has an app
     * @param clusterId management id of the host cluster (c-m-xxxxxxxx)
     * @param version chart version; defaults to the newest in the repo
     */
    installK3k(clusterId: string, version?: string): Chainable<void>;
  }
}
