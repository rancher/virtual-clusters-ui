<script setup lang="ts">
import { ref, watch } from 'vue';
import { useStore } from 'vuex';
import SecretMountItem from './SecretMount.vue';
import type { SecretMount } from '../../../types/k3k';
import { RcSection } from '@components/RcSection';

defineOptions({ name: 'K3kSecretMounts' });

const store = useStore();
// const t = store.getters['i18n/t'];

const props = defineProps<{
  mode: string;
  parentCluster: Record<string, any> | null;
  targetNamespace: string;
  secretMounts: SecretMount[];
}>();

const emit = defineEmits<{
  'update:secretMounts': [value: SecretMount[]];
}>();

const secrets = ref<string[]>([]);
const loadingSecrets = ref(false);
const secretErrors = ref<string[]>([]);

async function fetchSecrets() {
  if (!props.parentCluster || !props.targetNamespace) {
    secrets.value = [];

    return;
  }

  loadingSecrets.value = true;
  secretErrors.value = [];

  try {
    await props.parentCluster.waitForMgmt();
    const mgmtCluster = props.parentCluster.mgmt;

    const res = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ mgmtCluster.id }/v1/secrets/${ props.targetNamespace }`,
      method: 'GET',
    });

    secrets.value = (res.data || []).map((s: any) => s.metadata.name);
  } catch (err: any) {
    secrets.value = [];
    secretErrors.value.push(err?.message || String(err));
  }

  loadingSecrets.value = false;
}

watch(
  () => [props.parentCluster, props.targetNamespace],
  () => {
    emit('update:secretMounts', []);
    fetchSecrets();
  }
);

function addMount() {
  const updated: SecretMount[] = [...props.secretMounts, {
    secretName: '',
    mountPath:  '',
    role:       'all'
  }];

  emit('update:secretMounts', updated);
}

function removeMount(index: number) {
  const updated = [...props.secretMounts];

  updated.splice(index, 1);
  emit('update:secretMounts', updated);
}

function updateMount(index: number, mount: SecretMount) {
  const updated = [...props.secretMounts];

  updated[index] = mount;
  emit('update:secretMounts', updated);
}
</script>

<template>
  <div
    v-if="secretErrors.length"
    class="banner bg-error mb-10"
  >
    {{ secretErrors.join('. ') }}
  </div>
  <t
    k="k3k.secretMounts.description"
    raw
    class="text-deemphasized"
  />
  <template
    v-for="(mount, i) in secretMounts"
    :key="i"
  >
    <RcSection
      type="secondary"
      :expandable="true"
      :expanded="true"
      :title="mount.secretName || t('k3k.secretMounts.mountTitle')"
      mode="with-header"
    >
      <SecretMountItem
        :mode="mode"
        :secret-mount="mount"
        :secrets="secrets"
        :loading-secrets="loadingSecrets"
        @update:secret-mount="updateMount(i, $event)"
        @remove="removeMount(i)"
      />
    </RcSection>
  </template>
  <button
    v-if="mode !== 'view'"
    type="button"
    class="btn role-secondary add"
    @click="addMount"
  >
    <!-- //TODO nb use rcbutton; include plus icon -->
    {{ t('k3k.secretMounts.addLabel') }}
  </button>
</template>
