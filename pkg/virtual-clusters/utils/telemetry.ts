import { COUNT, MANAGEMENT } from '@shell/config/types';
import { TelemetryParams } from '@shell/core/types';
import { K3K } from '../types';
import { MODES } from './shared';
import { PROVIDER, K3K_MODE } from '../labels-annotations';

export const TELEMETRY_PARAMS = {
  CLUSTER_COUNT: 'vccc',
  MODE_SHARED:   'vcms',
  MODE_VIRTUAL:  'vcmv',
  MODE_HCP:      'vcmhcp',
  MODE_UNKNOWN:  'vcmu',
  POLICY_COUNT:  'vcpc',
};

// the telemetry function must be synchronous and therefore only reports on lists that are already loaded
// send nothing instead of sending 0 if a list isn't loaded yet
function loaded(getters: any, store: string, type: string): any[] | undefined {
  if (getters[`${ store }/haveAll`]?.(type)) {
    return getters[`${ store }/all`](type);
  }

  return undefined;
}

let fetchedClusters: any[] | undefined;


// with ssp enabled, all management clusters are no longer loaded in loadManagement
// use the labels apoplied by vc ui to find relevant management clusters without re-introducing a fetch for all of them
export async function fetchTelemetryClusters(store: any): Promise<void> {
  try {
    const res = await store.dispatch('management/request', { url: `/v1/${ MANAGEMENT.CLUSTER }s?filter=status.info.machineProvider=k3k` });

    fetchedClusters = res?.data;
  } catch (e) {
    fetchedClusters = undefined;
  }
}

export function virtualClusterTelemetry(getters: any): TelemetryParams {
  const params: TelemetryParams = {};

  const mgmtClusters = loaded(getters, 'management', MANAGEMENT.CLUSTER) || fetchedClusters;

  if (mgmtClusters) {
    const virtualClusters = mgmtClusters.filter((c: any) => c.metadata?.annotations?.[PROVIDER] === 'k3k');
    const modeCount = (mode?: string) => virtualClusters.filter((c: any) => c.metadata?.annotations?.[K3K_MODE] === mode).length;

    const shared = modeCount(MODES.SHARED);
    const virtual = modeCount(MODES.VIRTUAL);
    const hcp = modeCount(MODES.HCP);

    params[TELEMETRY_PARAMS.CLUSTER_COUNT] = virtualClusters.length;
    params[TELEMETRY_PARAMS.MODE_SHARED] = shared;
    params[TELEMETRY_PARAMS.MODE_VIRTUAL] = virtual;
    params[TELEMETRY_PARAMS.MODE_HCP] = hcp;
  }

  // send policy data if available: these are stored in each host cluster
  // so unlike mgmt clusters above, we don't have a single endpoint from which we can get a sum total
  const policyCount = loaded(getters, 'cluster', COUNT)?.[0]?.counts?.[K3K.POLICY]?.summary?.count;

  if (policyCount !== undefined) {
    params[TELEMETRY_PARAMS.POLICY_COUNT] = policyCount;
  }

  return params;
}
