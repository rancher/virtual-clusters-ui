<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useStore } from 'vuex';
import { base64Decode, sha256 } from '@shell/utils/crypto';
import { PARENT_CLUSTER, K3K_NAMESPACE } from '../labels-annotations';
import { RcSection } from '@components/RcSection';
import { RcContentGroup } from '@components/Layout';
import CopyCode from '@shell/components/CopyCode.vue';
import { LabeledInput } from '@components/Form/LabeledInput';
import Checkbox from '@components/Form/Checkbox/Checkbox.vue';
import RcKeyValue from '@shell/components/form/RcKeyValue.vue';
import Select from '@shell/components/form/Select.vue';
import Banner from '@components/Banner/Banner.vue';
import { _EDIT } from '@shell/config/query-params';

const KUBE_API_PORT = 6443;
const TAINT_EFFECTS = ['NoSchedule', 'PreferNoSchedule', 'NoExecute'];
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];
const POLL_INTERVAL = 5000;
const MAX_POLL_INTERVAL = 60000;
const NO_ACCESS_STATUSES = [401, 403];
// retrying cannot fix a missing permission
// the k3k cluster is created before the provisioning cluster, so a 404 for it means the cluster or its CRD is gone
const TERMINAL_STATUSES = [...NO_ACCESS_STATUSES, 404];

const props = defineProps<{
  resource: Record<string, any>;
}>();

const store = useStore();
const t = (key: string) => store.getters['i18n/t'](key);

const parentClusterId = computed(() => props.resource?.metadata?.annotations?.[PARENT_CLUSTER] || '');
const targetNamespace = computed(() => props.resource?.metadata?.annotations?.[K3K_NAMESPACE] || '');
const clusterName = computed(() => props.resource?.metadata?.name || '');


// Ported from k3k (SafeConcatNameWithPrefix) - this lets the UI reliably re-construct the names of objects created by k3k
// eg the service name is *usually* k3k-<cluster name>-service, unless cluster name is so long that this would exceed service name limits
function k3kName(...parts: string[]): string {
  const fullPath = ['k3k', ...parts].filter((p) => !!p).join('-');

  if (fullPath.length < 64) {
    return fullPath;
  }

  const digest = sha256(fullPath, 'hex', undefined) as string;

  return /[a-z0-9]/.test(fullPath[56]) ? `${ fullPath.slice(0, 57) }-${ digest.slice(0, 5) }` : `${ fullPath.slice(0, 56) }-${ digest.slice(0, 6) }`;
}

const tokenSecret = ref<Record<string, any> | null>(null);
const k3kCluster = ref<Record<string, any> | null>(null);
const serverService = ref<Record<string, any> | null>(null);
const nodes = ref<Record<string, any>[]>([]);
const serverPods = ref<Record<string, any>[]>([]);
const loaded = ref(false);
const error = ref('');
const noHostAccess = ref(false);

// tokenSecretRef replaces the usual secret k3k would generate
const tokenSecretPath = computed(() => {
  const ref = k3kCluster.value?.spec?.tokenSecretRef;

  if (ref?.name) {
    return `${ ref.namespace || targetNamespace.value }/${ ref.name }`;
  }

  return `${ targetNamespace.value }/${ k3kName(clusterName.value, 'token') }`;
});

const token = computed(() => {
  const encoded = tokenSecret.value?.data?.token;

  return encoded ? base64Decode(encoded) : '';
});

const isLoadBalancer = computed(() => serverService.value?.spec?.type === 'LoadBalancer');

/**
 * Find the port of the k3s supervisor that external workers connect to
 * A LoadBalancer can expose it on an additional custom port
 */
const serverPort = computed(() => {
  const ports = serverService.value?.spec?.ports || [];
  const supervisor = ports.find((p: any) => p.name === 'k3s-server-port') ||
    ports.find((p: any) => p.targetPort === KUBE_API_PORT || p.port === KUBE_API_PORT);

  if (serverService.value?.spec?.type === 'NodePort') {
    return supervisor?.nodePort || null;
  }

  if (isLoadBalancer.value) {
    return ports.find((p: any) => p.name === 'k3s-server-lb-port')?.port || supervisor?.port || null;
  }

  return supervisor?.port || null;
});

const loadBalancerHost = computed(() => {
  const lbIngress = serverService.value?.status?.loadBalancer?.ingress?.[0];

  return lbIngress?.ip || lbIngress?.hostname || '';
});

// HCP mode requires at least one non-loopback host the external workers can reach
// only hosts in the SANs pass the agent's TLS verification
const sanHost = computed(() => (k3kCluster.value?.spec?.tlsSANs || []).find((s: string) => s && !LOOPBACK.includes(s)) || '');

// k3k sets externalTrafficPolicy: Local in hcp mode, so only nodes running a server pod answer on the NodePort
// the address must also be in the server certificate
const serverNodeHost = computed(() => {
  const certifiedSans: string[] = k3kCluster.value?.status?.tlsSANs || [];
  const serverNodeNames = serverPods.value
    .filter((pod) => pod?.spec?.nodeName && !pod?.metadata?.deletionTimestamp)
    .map((pod) => pod.spec.nodeName);

  const address = nodes.value
    .filter((node) => serverNodeNames.includes(node?.metadata?.name))
    .flatMap((node) => node?.status?.addresses || [])
    .find((a: any) => a.type === 'InternalIP' && certifiedSans.includes(a.address));

  return address?.address || '';
});

/**
 * An HCP virtual cluster's apiserver runs inside the host cluster. External machines reach it through,
 * in order of preference:
 *
 * 1. the LoadBalancer address of the cluster service
 *    a LoadBalancer without an address is not reachable on any other host, so nothing else is tried
 * 2. the first non-loopback k3k cluster spec.tlsSANs entry
 * 3. the internal address of a host node running a server pod
 */
const serverHost = computed(() => {
  if (isLoadBalancer.value) {
    return loadBalancerHost.value;
  }

  return sanHost.value || serverNodeHost.value;
});

const serverUrl = computed(() => {
  if (!serverHost.value || !serverPort.value) {
    return '';
  }

  // an IPv6 literal must be bracketed before a port is appended
  const host = serverHost.value.includes(':') && !serverHost.value.startsWith('[') ? `[${ serverHost.value }]` : serverHost.value;

  return `https://${ host }:${ serverPort.value }`;
});

// k3k cluster version is either explicitly set by spec.version or it is derived from host cluster version
const installVersion = computed(() => {
  const hostVersion = k3kCluster.value?.status?.hostVersion;
  const version = k3kCluster.value?.spec?.version || (hostVersion ? `${ hostVersion }-k3s1` : '');

  return version.replace('-', '+');
});

// k3k only makes the server reachable from outside the host cluster through an ingress, load balancer or node port
// an ingress routes to a ClusterIP service, so the service type alone does not show that the server is exposed
const isExposed = computed(() => serverService.value?.spec?.type !== 'ClusterIP' || !!k3kCluster.value?.spec?.expose?.ingress);

// the server is not exposed, or everything the command needs exists except an address the workers can reach
const missingServerAddress = computed(() => (!!serverService.value && !isExposed.value) ||
  (!!token.value && !!installVersion.value && !!serverService.value && !isLoadBalancer.value && !serverUrl.value));


const editMode = _EDIT;

const nodeName = ref('');
const nodeExternalIp = ref('');
const nodeIp = ref('');
const insecure = ref(false);
const nodeLabels = ref<Record<string, string>>({});
const taints = ref<Record<string, any>[]>([]);

// append advanced inputs to the registration command
const advancedArgs = computed(() => {
  const args: string[] = [];

  if (nodeName.value) {
    args.push(`--node-name ${ nodeName.value }`);
  }

  if (nodeExternalIp.value) {
    args.push(`--node-external-ip ${ nodeExternalIp.value }`);
  }

  if (nodeIp.value) {
    args.push(`--node-ip ${ nodeIp.value }`);
  }


  Object.entries(nodeLabels.value).forEach(([key, value]) => {
    if (key) {
      args.push(`--node-label ${ key }=${ value || '' }`);
    }
  });

  taints.value.forEach((taint) => {
    if (taint?.key) {
      args.push(`--node-taint ${ taint.key }=${ taint.value || '' }:${ taint.effect || TAINT_EFFECTS[0] }`);
    }
  });

  return args;
});

const baseCommand = computed(() => {
  if (!serverUrl.value || !token.value || !installVersion.value) {
    return '';
  }

  const env = `INSTALL_K3S_VERSION=${ installVersion.value } K3S_URL=${ serverUrl.value } K3S_TOKEN=${ token.value }`;
  const curl = `curl -sfL${ insecure.value ? ' --insecure' : '' }`;

  return `${ curl } https://get.k3s.io | ${ env } sh -${ advancedArgs.value.length ? 's -' : '' }`;
});

function errorStatus(err: any): number | undefined {
  return err?._status || err?.status;
}

function errorMessage(err: any): string {
  return err?.message || err?.data?.message || String(err);
}

async function fetchParentResource(path: string) {
  return store.dispatch('management/request', {
    url:                  `/k8s/clusters/${ parentClusterId.value }/v1/${ path }`,
    method:               'GET',
    // members of a virtual cluster may have no access to its host cluster, which returns 401
    // by default the shell treats a 401 as an expired session and logs the user out
    redirectUnauthorized: false,
  });
}


async function fetchPendingResource(path: string) {
  try {
    return await fetchParentResource(path);
  } catch (err) {
    if (errorStatus(err) === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Node discovery is only a fallback for the server address.
 * Users who cannot list host nodes or pods still get a command from a LoadBalancer or TLS SAN.
 */
async function fetchServerNodes() {
  try {
    const [podList, nodeList] = await Promise.all([
      fetchParentResource(`pods/${ targetNamespace.value }`),
      fetchParentResource('nodes'),
    ]);

    // cluster and role are the labels k3k sets on server pods
    serverPods.value = (podList?.data || []).filter((pod: any) => pod?.metadata?.labels?.cluster === clusterName.value && pod?.metadata?.labels?.role === 'server');
    nodes.value = nodeList?.data || [];
  } catch {
    serverPods.value = [];
    nodes.value = [];
  }
}

async function fetchAll() {
  k3kCluster.value = await fetchParentResource(`k3k.io.clusters/${ targetNamespace.value }/${ clusterName.value }`);

  if (!k3kCluster.value) {
    return;
  }

  const [secret, service] = await Promise.all([
    fetchPendingResource(`secrets/${ tokenSecretPath.value }`),
    fetchPendingResource(`services/${ targetNamespace.value }/${ k3kName(clusterName.value, 'service') }`),
  ]);

  tokenSecret.value = secret;
  serverService.value = service;

  if (service && isExposed.value && !isLoadBalancer.value && !sanHost.value) {
    await fetchServerNodes();
  }
}

/**
 * Users navigate directly from the create form to this tab so downstream resources may not exist yet.
 * We're in the Management product and the host cluster steve store isn't loaded (loadCluster),
 * so we are not listening to a websocket for resource updates, and we need to poll for them instead.
 * The interval doubles after each attempt. Polling stops when the command is complete, when the server
 * has no address workers can reach, or when the tab is unmounted.
 */
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollInterval = POLL_INTERVAL;
let unmounted = false;

async function poll() {
  try {
    await fetchAll();
    error.value = '';
  } catch (err) {
    const status = errorStatus(err) as number;

    noHostAccess.value = NO_ACCESS_STATUSES.includes(status);
    error.value = noHostAccess.value ? '' : errorMessage(err);

    if (TERMINAL_STATUSES.includes(status)) {
      loaded.value = true;

      return;
    }
  }

  loaded.value = true;

  if (!unmounted && !baseCommand.value && !missingServerAddress.value) {
    pollTimer = setTimeout(poll, pollInterval);
    pollInterval = Math.min(pollInterval * 2, MAX_POLL_INTERVAL);
  }
}

onBeforeUnmount(() => {
  unmounted = true;
  clearTimeout(pollTimer);
});

if (parentClusterId.value && targetNamespace.value && clusterName.value) {
  poll();
} else {
  loaded.value = true;
}
</script>

<template>
  <div>
    <div v-if="!loaded">
      {{ t('generic.loading') }}
    </div>
    <Banner
      v-else-if="noHostAccess"
      color="error"
      label-key="k3k.hcp.registration.noHostAccess"
    />
    <RcContentGroup
      v-else
    >
      <p
        v-if="error"
        class="text-error"
      >
        {{ error }}
      </p>
      <RcSection
        type="primary"
        mode="with-header"
        :expandable="false"
        :title="t('k3k.hcp.registration.title')"
      >
        <RcContentGroup>
          <p class="text-muted">
            {{ t('k3k.hcp.registration.description') }}
          </p>
          <Banner
            v-if="missingServerAddress"
            color="error"
            label-key="k3k.hcp.registration.noServerAddress"
          />
          <p
            v-else-if="!baseCommand"
            class="text-muted"
          >
            {{ t('k3k.hcp.registration.pending') }}
          </p>
          <!-- arguments have their own span for css highlighting -->
          <CopyCode
            v-else
            class="registration-command"
          >
            <span>{{ baseCommand }}</span>
            <span
              v-for="(arg, i) in advancedArgs"
              :key="i"
              class="appended-arg"
            >{{ arg }}</span>
          </CopyCode>
        </RcContentGroup>
      </RcSection>

      <RcSection
        type="secondary"
        mode="with-header"
        background="secondary"
        expandable
        :expanded="false"
        :title="t('k3k.hcp.advanced.title')"
      >
        <RcContentGroup>
          <p class="text-muted">
            {{ t('k3k.hcp.advanced.description') }}
          </p>

          <div class="k3k-input-row">
            <LabeledInput
              v-model:value="nodeName"
              :label="t('k3k.hcp.advanced.nodeName')"
              :mode="editMode"
            />
            <LabeledInput
              v-model:value="nodeExternalIp"
              :label="t('k3k.hcp.advanced.nodeExternalIp')"
              :mode="editMode"
            />
            <LabeledInput
              v-model:value="nodeIp"
              :label="t('k3k.hcp.advanced.nodeIp')"
              :mode="editMode"
            />
          </div>

          <Checkbox
            v-model:value="insecure"
            :mode="editMode"
            :label="t('k3k.hcp.advanced.insecure')"
          />

          <RcSection
            type="secondary"
            mode="with-header"
            expandable
            :title="t('k3k.hcp.advanced.labels.title')"
          >
            <RcContentGroup>
              <p class="text-muted">
                {{ t('k3k.hcp.advanced.labels.description') }}
              </p>
              <RcKeyValue
                v-model:value="nodeLabels"
                :mode="editMode"
                :add-label="t('k3k.hcp.advanced.labels.add')"
                add-icon="icon-plus"
                :read-allowed="false"
                use-rc-button
              />
            </RcContentGroup>
          </RcSection>

          <RcSection
            type="secondary"
            mode="with-header"
            expandable
            :title="t('k3k.hcp.advanced.taints.title')"
          >
            <RcContentGroup>
              <p class="text-muted">
                {{ t('k3k.hcp.advanced.taints.description') }}
              </p>
              <RcKeyValue
                v-model:value="taints"
                :mode="editMode"
                :as-map="false"
                :read-allowed="false"
                :protip="false"
                :show-header="true"
                :default-add-data="{ effect: TAINT_EFFECTS[0] }"
                :extra-columns="['effect']"
                :preserve-keys="['effect']"
                :add-label="t('k3k.hcp.advanced.taints.add')"
                add-icon="icon-plus"
                use-rc-button
              >
                <!-- @vue-expect-error RcKeyValue builds extra column slot names at runtime, so they are not typed -->
                <template #label:effect>
                  {{ t('tableHeaders.effect') }}
                </template>
                <!-- @vue-expect-error RcKeyValue builds extra column slot names at runtime, so they are not typed -->
                <template #col:effect="{ row, queueUpdate, i }">
                  <Select
                    v-model:value="row.effect"
                    :data-testid="`taints-effect-row-${ i }`"
                    :options="TAINT_EFFECTS"
                    :mode="editMode"
                    class="compact-select"
                    @update:value="queueUpdate"
                  />
                </template>
              </RcKeyValue>
            </RcContentGroup>
          </RcSection>
        </RcContentGroup>
      </RcSection>
    </RcContentGroup>
  </div>
</template>

<style lang="scss" scoped>
.registration-command {
  display: block;
  overflow-wrap: anywhere;

  span + span {
    margin-left: 0.5ch;
  }
}

.appended-arg {
  background-color: var(--accent-btn);
  border-radius: 2px;
  display: inline-block;
  font-style: italic;
  font-weight: bold;
  padding: 0 2px;
  white-space: nowrap;
}

.compact-select {
  height: 40px;
}
</style>
