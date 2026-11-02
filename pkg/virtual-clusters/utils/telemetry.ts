import { COUNT, MANAGEMENT } from '@shell/config/types';
import { TelemetryParams } from '@shell/core/types';
import { K3K } from '../types';
import { MODES } from './shared';
import { PROVIDER, K3K_MODE } from '../labels-annotations';

export const TELEMETRY_PARAMS = {
  CLUSTER_COUNT: 'vc-cluster-count',
  MODE_SHARED:   'vcms',
  MODE_VIRTUAL:  'vcmv',
  MODE_HCP:      'vcmhcp',
  MODE_UNKNOWN:  'vcmu',
  POLICY_COUNT:  'vc-policy-count',
};

// the telemetry function must be synchronous: only read lists the store already holds
// a param is omitted, not sent as 0, when its list is not loaded
function loaded(getters: any, store: string, type: string): any[] | undefined {
  if (getters[`${ store }/haveAll`]?.(type)) {
    return getters[`${ store }/all`](type);
  }

  return undefined;
}

let fetchedClusters: any[] | undefined;

// loadManagement does not fetch management clusters when cluster server-side pagination is enabled
// rancher sets status.info.machineProvider from the ui.rancher/provider annotation, and the sql cache can filter on it
// runs from onLogIn, before loadManagement, so it can finish before dynamic content reads telemetry
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
  // rancher copies the provisioning cluster's annotations to the management cluster when it creates it
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
    // clusters created before the mode annotation was added
    params[TELEMETRY_PARAMS.MODE_UNKNOWN] = virtualClusters.length - shared - virtual - hcp;
  }

  // loadManagement fetches counts for the local cluster only
  // policies in downstream host clusters are not included
  // no entry when the policy crd is not installed in the local cluster
  const policyCount = loaded(getters, 'management', COUNT)?.[0]?.counts?.[K3K.POLICY]?.summary?.count;

  if (policyCount !== undefined) {
    params[TELEMETRY_PARAMS.POLICY_COUNT] = policyCount;
  }

  return params;
}
