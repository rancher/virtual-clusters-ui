/**
 * Names of the helm repo, chart, release and namespace the extension installs k3k into.
 * Kept free of `@shell` imports so that they can also be consumed outside of the extension
 * bundle - eg the cypress installK3k/uninstallK3k commands.
 */
export const K3K_CHART_NAME = 'suse-virtual-cluster-engine';
export const K3K_CHART_NAMESPACE = 'k3k-system';
export const K3K_REPO_NAME = 'suse-virtual-cluster-engine';
export const K3K_REPO_URL = 'oci://registry.suse.com/rancher/charts/appco-suse-virtual-cluster-engine';

export const K3K_VALUES = {
  server: {
    image: {
      registry:   'registry.rancher.com',
      repository: 'rancher/k3s'
    }
  },
  agent: {
    shared: {
      image: {
        registry:   'registry.suse.com',
        repository: 'rancher/appco-k3k-kubelet'
      }
    },
    virtual: {
      image: {
        registry:   'registry.rancher.com',
        repository: 'rancher/k3s'
      }
    }
  },
  controller: {
    image: {
      registry:   'registry.suse.com',
      repository: 'rancher/appco-k3k'
    }
  }
};
