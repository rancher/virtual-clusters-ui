import { ModelExtensionContext, IClusterModelExtension } from '@shell/core/types';
import { PROVIDER, PARENT_CLUSTER, PARENT_CLUSTER_DISPLAY, K3K_NAMESPACE } from '../labels-annotations';

type ICluster = any;


export class VClusterModelExtension implements IClusterModelExtension {
  constructor(private context: ModelExtensionContext) {}

  useFor(cluster: ICluster) {
    return cluster?.metadata?.annotations[PROVIDER] === 'k3k';
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
    return cluster?.metadata?.annotations[PROVIDER];
  }

  parentCluster(cluster: ICluster): string {
    return cluster.metadata?.annotations?.[PARENT_CLUSTER_DISPLAY];
  }


  async postDelete(cluster: ICluster): Promise<any> {
    const parentClusterId = cluster.metadata?.annotations?.[PARENT_CLUSTER];
    const namespace = cluster.metadata?.annotations?.[K3K_NAMESPACE];
    const name = cluster.metadata.name;


    if (parentClusterId && namespace) {
      try {
        await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/batch.jobs/${ namespace }/import-${ name }`,
          method: 'DELETE',
        });
        await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/configmaps/${ namespace }/import-${ name }`,
          method: 'DELETE',
        });
        await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/k3k.io.clusters/${ namespace }/${ name }`,
          method: 'DELETE',
        });
      } catch (e: any) {
        // silently fail if deleting fails on "not found"
        // may have been deleted elsewhere or the cluster may be being deleted because configmap/job/k3kCluster were not created successfully
        if (e?.status !== 404) {
          cluster.$dispatch('growl/error', {
            title:   this.context.t('k3k.errors.deletingClusterGeneric'),
            message: e
          }, { root: true });
        }
      }
    }
  }
}
