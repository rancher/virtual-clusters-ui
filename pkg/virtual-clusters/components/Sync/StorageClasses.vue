<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import throttle from 'lodash/throttle';
import { _CREATE, _VIEW } from '@shell/config/query-params';
import KeyValue from '@shell/components/form/KeyValue.vue';
import ButtonGroup from '@rancher/shell/components/ButtonGroup';
import RcSection from '@rancher/shell/rancher-components/RcSection/RcSection';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import { matching, labelSelectorToSelector } from '@shell/utils/selector-typed';
import { STORAGE_CLASS } from '@shell/config/types';
import { NAME as EXPLORER } from '@shell/config/product/explorer';

const props = defineProps({
  mode: {
    type:    String,
    default: _CREATE
  },

  storageClassesSync: {
    type:    Object,
    default: () => ({})
  },

  /**
   * Provisioning cluster object. Required when this component is rendered inside a
   * Resource Drawer (e.g. policy form during cluster creation) where `currentCluster`
   * is not set in the store. Mirrors the pattern used by K3kVersionBanner.
   */
  parentCluster: {
    type:    Object,
    default: null
  }
});

const emit = defineEmits(['update:storageClassesSync', 'error']);

const store = useStore();
const t = store.getters['i18n/t'];

/**
 * Resolved management cluster ID – prefers parentCluster (drawer context) but
 * falls back to currentCluster (normal page navigation).
 */
const targetMgmtId = computed(() => {
  const resolved = props.parentCluster || store.getters.currentCluster || null;

  return resolved?.mgmt?.id || resolved?.id || null;
});

/**
 * True when the `cluster` store context is initialised for the correct cluster
 * so that `matching()` can be used directly.
 * False in the drawer case – requires a raw management/request instead.
 */
const hasClusterStoreContext = computed(() => !!store.getters.currentCluster);

const isView = computed(() => props.mode === _VIEW);

const storageClassEnabled = computed({
  get: () => props.storageClassesSync?.enabled || false,
  set: (neu) => {
    emit('update:storageClassesSync', { ...props.storageClassesSync, enabled: neu });
  }
});

const storageClassSelector = computed({
  get: () => props.storageClassesSync?.selector || {},
  set: (neu) => {
    emit('update:storageClassesSync', { ...props.storageClassesSync, selector: neu });
  }
});

const useStorageClassSelector = computed({
  get: () => !!props.storageClassesSync?.selector,
  set: (neu) => {
    const out = { ...props.storageClassesSync };

    if (neu) {
      out.selector = out.selector || {};
    } else {
      delete out.selector;
    }

    emit('update:storageClassesSync', out);
  }
});

const storageClassSelectorOptions = [
  {
    labelKey: 'k3k.policy.synchronization.storageClass.allStorageClasses',
    value:    false
  },
  {
    labelKey: 'k3k.policy.synchronization.storageClass.manuallySelectStorageClasses',
    value:    true
  }
];

const targetedStorageClasses = ref(null);

const hasSelectors = computed(() => useStorageClassSelector.value && Object.keys(storageClassSelector.value || {}).length > 0);

const selectedStorageClassesTitle = computed(() => {
  const count = targetedStorageClasses.value?.matched;

  if (count > 0) {
    return t('k3k.policy.synchronization.storageClass.storageClassesSelected', { count });
  }
  if (hasSelectors.value) {
    return t('k3k.policy.synchronization.storageClass.noClassesSynced');
  }

  return t('k3k.policy.synchronization.storageClass.allStorageClassesSynced');
});

const updateMatchingResources = throttle(async() => {
  if (!targetMgmtId.value) {
    targetedStorageClasses.value = null;

    return;
  }

  try {
    if (hasClusterStoreContext.value) {
      // Normal page navigation: the `cluster` store is initialised and handles
      // both pagination modes (VAI / legacy) transparently.
      targetedStorageClasses.value = await matching({
        labelSelector: { matchLabels: storageClassSelector.value },
        type:          STORAGE_CLASS,
        inStore:       'cluster',
        $store:        store,
      });
    } else {
      // component is being used in the drawer in cluster configuration: no cluster store available
      //
      // Steve supports pagination via the `continue` response field,
      // but storage class counts are typically quite low, so a limit of 500 here should be more than enough
      const selector = labelSelectorToSelector({ matchLabels: storageClassSelector.value });
      const url = `/k8s/clusters/${ targetMgmtId.value }/v1/storage.k8s.io.storageclasses?labelSelector=${ encodeURIComponent(selector) }&limit=500`;

      const res = await store.dispatch('management/request', {
        url,
        method: 'GET',
      });
      const items = await Promise.all(
        (res.data || []).map((item) => store.dispatch('management/create', { ...item, type: STORAGE_CLASS }))
      );

      targetedStorageClasses.value = {
        matched: items.length,
        matches: items,
        none:    items.length === 0,
        sample:  items[0]?.metadata?.name,
        total:   items.length,
      };
    }
  } catch (err) {
    targetedStorageClasses.value = null;
    const message = err?.message || err?.data || String(err);

    emit('error', `${ t('k3k.policy.synchronization.storageClass.errorFetchingStorageClasses') } ${ message }`);
  }
}, 250, { leading: true });

watch(storageClassSelector, (neu) => {
  if (neu && Object.keys(neu).length > 0) {
    updateMatchingResources();
  } else {
    targetedStorageClasses.value = null;
  }
}, { immediate: true });

</script>

<template>
  <RcSection
    :title="t('k3k.policy.synchronization.storageClass.title')"
    mode="with-header"
    :expandable="true"
    type="primary"
  >
    <t
      class="text-muted"
      k="k3k.policy.synchronization.storageClass.tooltip"
      raw
    />
    <Checkbox
      v-model:value="storageClassEnabled"
      :mode="mode"
      :label="t('k3k.policy.synchronization.storageClass.checkbox')"
    />
    <div v-if="storageClassEnabled">
      <ButtonGroup
        v-model:value="useStorageClassSelector"
        :options="storageClassSelectorOptions"
        :disabled="isView"
        active-class="role-secondary"
      />
      <RcSection
        v-if="useStorageClassSelector"
        :title="t('k3k.policy.synchronization.storageClass.selectByLabel')"
        mode="with-header"
        :expandable="true"
        class="mt-20"
        type="secondary"
      >
        <div class="row">
          <div class="col span-6">
            <KeyValue
              v-model:value="storageClassSelector"
              :initial-empty-row="true"
              :mode="mode"
              :key-label="t('k3k.policy.synchronization.storageClass.selectorLabel')"
              :key-placeholder="t('k3k.policy.synchronization.storageClass.selectorKeyPlaceholder')"
              :value-placeholder="t('k3k.policy.synchronization.storageClass.selectorValuePlaceholder')"
              :add-label="t('k3k.policy.synchronization.storageClass.addSelectorLabel')"
              :read-allowed="false"
            />
          </div>
          <div class="col span-6">
            <RcSection
              :title="selectedStorageClassesTitle"
              mode="with-header"
              :expandable="false"
              type="secondary"
            >
              <span
                v-if="!targetedStorageClasses?.matched"
                class="text-muted"
              >
                {{ t('k3k.policy.synchronization.storageClass.selectByLabelHint') }}
              </span>
              <template v-else>
                <div
                  v-for="(sc, i) in targetedStorageClasses.matches"
                  :key="i"
                >
                  <router-link
                    :to="{ ...sc.detailLocation, params: { ...sc.detailLocation.params, cluster: targetMgmtId, product: EXPLORER } }"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ sc.nameDisplay }}
                  </router-link>
                </div>
              </template>
            </RcSection>
          </div>
        </div>
      </RcSection>
    </div>
  </RcSection>
</template>

<style lang="scss" scoped>
:deep(.section-content) {
  gap: 16px;
}
</style>
