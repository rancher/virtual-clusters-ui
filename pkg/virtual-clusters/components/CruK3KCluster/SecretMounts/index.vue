<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import SecretMountItem from './SecretMount.vue';
import type { SecretMount } from '../../../types/k3k';
import { _VIEW } from '@shell/config/query-params';
import { RcSection, RcSectionActions } from '@components/RcSection';
import { RcContentGroup } from '@components/Layout';
import { RcButton } from '@components/RcButton';
import { RcCounterBadge } from '@components/Pill';

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

const isView = computed(() => props.mode === _VIEW);

const mountsWithSecretsDefined = computed(() => props.secretMounts.filter((mount) => !!mount.secretName));

// track mounts provided as props (while editing a cluster) vs newly added mounts
// the latter will be expanded by default
let initialMountIndexes = new Set(props.secretMounts.map((_, i) => i));

function isNewMount(index: number): boolean {
  return !initialMountIndexes.has(index);
}

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

// reset mounts when parent cluster or namespace changes, since available secrets will change
watch(
  () => [props.parentCluster, props.targetNamespace],
  () => {
    initialMountIndexes = new Set();
    emit('update:secretMounts', []);
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

  // shift indexes above the removed one down by one so remaining initial mounts stay correctly categorized
  initialMountIndexes = new Set(
    [...initialMountIndexes]
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i))
  );

  emit('update:secretMounts', updated);
}

function updateField(index: number, field: keyof SecretMount, value: unknown) {
  const updated = [...props.secretMounts];

  updated[index] = {
    ...updated[index],
    [field]: value
  };
  emit('update:secretMounts', updated);
}

function mountTitle(mount: SecretMount): {name: string, path?: string} {
  const name = mount.secretName || store.getters['i18n/t']('k3k.secretMounts.mountTitle');
  const mountPath = mount.mountPath;

  // grab the last segment of the mount path to append to the title, since mount.secretName is not necessarily unique
  if (mountPath) {
    const trailingSlash = mountPath.endsWith('/');
    const trimmed = mountPath.replace(/\/+$/, '');
    const lastSegment = trimmed.split('/').pop();

    const path = `/${ lastSegment }${ trailingSlash ? '/' : '' }`;

    return {
      name,
      path
    };
  }

  return { name };
}
</script>

<template>
  <RcSection
    mode="with-header"
    :expandable="true"
    :expanded="true"
    type="secondary"
    :title="t('k3k.secretMounts.title')"
  >
    <template #counter>
      <RcCounterBadge
        :count="mountsWithSecretsDefined.length"
        type="inactive"
      />
    </template>
    <RcContentGroup>
      <div
        v-if="secretErrors.length"
        class="banner bg-error"
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
          :expanded="isNewMount(i)"
          :title="mountTitle(mount).name"
          mode="with-header"
          class="secret-mount"
        >
          <template #title>
            <span class="mount-title">
              <span class="title-name">{{ mountTitle(mount).name }}</span>
              <span
                v-if="mountTitle(mount).path"
                class="title-path"
              >&nbsp; — &nbsp;{{ mountTitle(mount).path }}</span>
            </span>
          </template>
          <RcContentGroup>
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
          </RcContentGroup>
          <template #actions>
            <RcSectionActions
              :actions="[{ icon: 'trash', ariaLabel: t('generic.remove') , action: ()=>removeMount(i) }]"
            />
          </template>
        </RcSection>
      </template>
      <div>
        <RcButton
          v-if="!isView"
          size="small"
          variant="secondary"
          left-icon="plus"
          @click="addMount"
        >
          {{ t('k3k.secretMounts.addLabel') }}
        </RcButton>
      </div>
    </RcContentGroup>
  </RcSection>
</template>

<style lang="scss" scoped>
// style rules to make the secret name use text-overflow: ellipsis while preserving the path
.secret-mount {
  overflow: hidden;
}

.secret-mount :deep(.section-header .actions) {
  padding-top: 0px;
}

.secret-mount :deep(.section-header .left-wrapper) {
  min-width: 0;
  width: 0;
  flex: 1 1 0%;
}

.secret-mount :deep(.section-header .title) {
  overflow: hidden;
  min-width: 0;
  width: 100%;
}

.mount-title {
  display: flex;
  min-width: 0;
  overflow: hidden;
  width: 100%;

  .title-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 0 1 auto;
  }

  .title-path {
    flex-shrink: 0;
    white-space: nowrap;
  }
}
</style>
