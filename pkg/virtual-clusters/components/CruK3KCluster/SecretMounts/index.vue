<script setup lang="ts">
import { ref, watch } from 'vue';
import { useStore } from 'vuex';
import SecretMountItem from './SecretMount.vue';
import type { SecretMount } from '../../../types/k3k';
import { RcSection, RcSectionActions } from '@components/RcSection';
import { RcButton } from '@components/RcButton';

defineOptions({ name: 'K3kSecretMounts' });

const DEFAULT_MOUNT = {
  secretName: '',
  mountPath:  '',
  role:       'all'
} as SecretMount;

const store = useStore();

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
    emit('update:secretMounts', [{ ...DEFAULT_MOUNT }]);
    fetchSecrets();
  }
);

function addMount() {
  const updated: SecretMount[] = [...props.secretMounts, { ...DEFAULT_MOUNT }];

  emit('update:secretMounts', updated);
}

function removeMount(index: number) {
  const updated = [...props.secretMounts];

  updated.splice(index, 1);
  emit('update:secretMounts', updated);
}

function updateField(index: number, field: keyof SecretMount, value: unknown) {
  const updated = [...props.secretMounts];

  updated[index] = { ...updated[index], [field]: value };
  emit('update:secretMounts', updated);
}

function mountTitle(mount: SecretMount): string {
  const name = mount.secretName || store.getters['i18n/t']('k3k.secretMounts.mountTitle');
  const path = mount.mountPath;

  if (path) {
    const trailingSlash = path.endsWith('/');
    const trimmed = path.replace(/\/+$/, '');
    const lastSegment = trimmed.split('/').pop();

    return `${ name } \u2014 /${ lastSegment }${ trailingSlash ? '/' : '' }`;
  }

  return name;
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
      :title="mountTitle(mount)"
      mode="with-header"
      class="secret-mount"
    >
      <div class="gap-md">
        <SecretMountItem
          :mode="mode"
          :secret-name="mount.secretName || ''"
          :mount-path="mount.mountPath || ''"
          :sub-path="mount.subPath || ''"
          :role="mount.role || 'all'"
          :secrets="secrets"
          :loading-secrets="loadingSecrets"
          @update:secret-name="updateField(i, 'secretName', $event)"
          @update:mount-path="updateField(i, 'mountPath', $event)"
          @update:sub-path="updateField(i, 'subPath', $event)"
          @update:role="updateField(i, 'role', $event)"
        />
      </div>
      <template #actions>
        <RcSectionActions
          :actions="[{ icon: 'trash', ariaLabel: t('generic.remove') , action: ()=>removeMount(i) }]"
        />
      </template>
    </RcSection>
  </template>
  <div>
    <RcButton
      v-if="mode !== 'view'"
      size="small"
      variant="secondary"
      left-icon="plus"
      @click="addMount"
    >
      {{ t('k3k.secretMounts.addLabel') }}
    </RcButton>
  </div>
</template>

<style lang="scss" scoped>
.secret-mount :deep(.section-header .actions){
    padding-top: 0px;
}
// .gap-md {
//   display: flex;
//   flex-direction: column;
//   gap: var(--gap-md);
// }
</style>
