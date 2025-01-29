import { ModelExtensionContext, IClusterModelExtension } from '@shell/core/types';

type ICluster = any;

const ID = 'vcluster';

export class VClusterModelExtension implements IClusterModelExtension {
  constructor(private context: ModelExtensionContext) {}

  useFor(cluster: ICluster) {
    return cluster?.metadata?.annotations['ui.rancher/provider']  === 'k3k'
  }

  get detailTabs(): any {
    return {
      machines:     false,
      logs:         false,
      registration: false,
      snapshots:    false,
      related:      true,
      events:       false,
      conditions:   false,
    };
  }

  machineProviderDisplay(): string {
    return 'Virtual';
  }

  provisionerDisplay(): string {
    return 'K3K';
  }

  parentCluster(cluster: ICluster): string {
    return cluster.metadata?.annotations?.['ui.rancher/parent-cluster'];
  }

  async postDelete(cluster: ICluster): Promise<any> {
    const parentClusterId = cluster.metadata?.annotations?.['ui.rancher/parent-cluster'];
    const namespace = cluster.metadata?.annotations?.['ui.rancher/k3k-namespace'];

    // Should probably show a growl
    if (parentClusterId && namespace) {
      try {
        await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/api/v1/namespaces/${ namespace }`,
          method: 'DELETE',
        });
      } catch (e) {
        console.error(e); // eslint-disable-line no-console
      }
    }
  }
}
