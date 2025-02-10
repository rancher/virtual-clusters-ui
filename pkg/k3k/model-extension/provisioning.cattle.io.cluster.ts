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

  availableActions(cluster: any, actions: any[]): any[] | undefined {
    const cloneAction = actions.find(a=>a.action === 'goToClone')
    cloneAction.enabled = true

    return actions
  }

  machineProviderDisplay(): string {
    return 'Virtual';
  }

  // provisioner(cluster: ICluster): string {
  //   return cluster?.metadata?.annotations['ui.rancher/provider']
  // }

  provisionerDisplay(): string {
    return 'K3K';
  }

  parentCluster(cluster: ICluster): string {
    return cluster.metadata?.annotations?.['ui.rancher/parent-cluster-prov'];
  }

  parentClusterDisplay(cluster: ICluster): string {
    return (cluster.metadata?.annotations?.['ui.rancher/parent-cluster-display']||'').split('/')[1];
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
          url:    `/k8s/clusters/${ parentClusterId }/v1/namespaces/${ namespace }`,
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
