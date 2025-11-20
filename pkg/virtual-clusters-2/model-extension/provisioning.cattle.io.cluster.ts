import { ModelExtensionContext, IClusterModelExtension } from '@shell/core/types';

type ICluster = any;


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

  provisionerDisplay(cluster: ICluster): string {
    return cluster?.metadata?.annotations['ui.rancher/provider'];
  }

  parentCluster(cluster: ICluster): string {
    return cluster.metadata?.annotations?.['ui.rancher/parent-cluster-display'];
  }

  
  async postDelete(cluster: ICluster): Promise<any> {
    const parentClusterId = cluster.metadata?.annotations?.['ui.rancher/parent-cluster'];
    const namespace = cluster.metadata?.annotations?.['ui.rancher/k3k-namespace'];
    const name =  cluster.metadata.name

    // Should probably show a growl
    if (parentClusterId && namespace) {
      try {
        await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/k3k.io.clusters/${ namespace }/${ name }`,
          method: 'DELETE',
        });
          await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/batch.jobs/${ namespace }/import-${ name }`,
          method: 'DELETE',
        });
          await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/configmaps/${ namespace }/import-${ name }`,
          method: 'DELETE',
        });
      } catch (e) {
        cluster.$dispatch('growl/error', {
          title: 'Error deleting cluster',
          message: e
        }, {root: true})
        console.error(e); // eslint-disable-line no-console
      }
    }
  }
}
