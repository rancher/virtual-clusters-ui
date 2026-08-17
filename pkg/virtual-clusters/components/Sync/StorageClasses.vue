<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import debounce from 'lodash/debounce';
import { _CREATE, _VIEW } from '@shell/config/query-params';
import KeyValue from '@shell/components/form/KeyValue.vue';
import ButtonGroup from '@shell/components/ButtonGroup';
import { RcSection, RcSectionBadges } from '@components/RcSection';
import { RcTag, RcCounterBadge } from '@components/Pill';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import { matching } from '@shell/utils/selector-typed';
import { STORAGE_CLASS } from '@shell/config/types';
import { RcButton } from '@components/RcButton';
import { useI18n } from '@shell/composables/useI18n';

const props = defineProps({
  mode: {
    type:    String,
    default: _CREATE
  },

  enabled: {
    type:    Boolean,
    default: false
  },

  selector: {
    type:    Object,
    default: undefined
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

const emit = defineEmits(['update:enabled', 'update:selector', 'error']);

const store = useStore();
const tn = useI18n(store);

/**
 * Resolved management cluster ID – prefers parentCluster (drawer context) but
 * falls back to currentCluster (normal edit page).
 */
const targetMgmtId = computed(() => {
  const resolved = props.parentCluster || store.getters.currentCluster || null;

  return resolved?.mgmt?.id || resolved?.id || null;
});

const hasClusterStoreContext = computed(() => !!store.getters.currentCluster);

const isView = computed(() => props.mode === _VIEW);

const storageClassEnabled = computed({
  get: () => props.enabled,
  set: (neu) => {
    emit('update:enabled', neu);
  }
});

const storageClassSelector = computed({
  get: () => props.selector || {},
  set: (neu) => {
    emit('update:selector', neu);
  }
});

const useStorageClassSelector = computed({
  get: () => !!props.selector,
  set: (neu) => {
    if (neu) {
      emit('update:selector', props.selector || {});
    } else {
      emit('update:selector', undefined);
    }
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
const totalStorageClassCount = ref(0);
const fetchingMatchingClasses = ref(false);
const allClassesSelected = computed(() => {
  return Object.keys(storageClassSelector.value).length === 0;
});

const matchedCount = computed(() => {
  if (allClassesSelected.value) {
    return totalStorageClassCount.value;
  }

  // Fall back to total count while the debounced fetch is still pending
  return targetedStorageClasses.value?.length || 0;
});

// debounce to prevent fetching matching classes while user is still typing the selector
const updateMatchingResources = debounce(async() => {
  if (!targetMgmtId.value) {
    targetedStorageClasses.value = null;

    return;
  }

  fetchingMatchingClasses.value = true;

  try {
    if (hasClusterStoreContext.value) {
      // Normal page navigation: the `cluster` store is initialised and handles
      // both pagination modes (VAI / legacy) transparently.
      const res = await matching({
        labelSelector: { matchLabels: storageClassSelector.value },
        type:          STORAGE_CLASS,
        inStore:       'cluster',
        $store:        store,
      });

      targetedStorageClasses.value = res?.matches || [];
    } else {
      // component is being used in the drawer in cluster configuration: no cluster store available
      const filters = Object.entries(storageClassSelector.value)
        .map(([key, val]) => `filter=${ encodeURIComponent(`metadata.labels[${ key }] IN (${ val })`) }`)
        .join('&');

      const url = `/k8s/clusters/${ targetMgmtId.value }/v1/storage.k8s.io.storageclasses?pagesize=100000${ filters ? `&${ filters }` : '' }&exclude=metadata.managedFields`;

      const res = await store.dispatch('management/request', {
        url,
        method: 'GET',
      });

      targetedStorageClasses.value = await Promise.all(
        (res.data || []).map((item) => store.dispatch('management/create', {
          ...item,
          type: STORAGE_CLASS
        }))
      );
    }
  } catch (err) {
    targetedStorageClasses.value = null;
    const message = err?.message || err?.data || String(err);

    emit('error', `${ tn('k3k.policy.synchronization.storageClass.errorFetchingStorageClasses') } ${ message }`);
  } finally {
    fetchingMatchingClasses.value = false;
  }
}, 5);

const fetchTotalStorageClassCount = async() => {
  if (!targetMgmtId.value) {
    totalStorageClassCount.value = 0;

    return;
  }

  try {
    const count = await store.dispatch('management/request', {
      url:    `/k8s/clusters/${ targetMgmtId.value }/v1/counts/count`,
      method: 'GET',
    });

    totalStorageClassCount.value = count?.counts?.[STORAGE_CLASS]?.summary?.count || 0;
  } catch {
    totalStorageClassCount.value = 0;
  }
};

watch(useStorageClassSelector, (neu) => {
  if (neu) {
    fetchTotalStorageClassCount();
  }
}, { immediate: true });

watch(storageClassSelector, (neu) => {
  if (neu && Object.keys(neu).length > 0) {
    updateMatchingResources();
  }
}, { immediate: true });

</script>

<template>
  <RcSection
    :title="t('k3k.policy.synchronization.storageClass.title')"
    mode="with-header"
    :expandable="true"
    type="secondary"
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
        :title="t('k3k.policy.synchronization.storageClass.selectorsTitle')"
        mode="with-header"
        :expandable="true"
        class="mt-20 storage-selectors"
        type="secondary"
      >
        <div class="row storage-row">
          <div class="col span-8">
            <div class="row text-muted">
              {{ t('k3k.policy.synchronization.storageClass.selectorsDescription') }}
            </div>
            <KeyValue
              v-model:value="storageClassSelector"
              :initial-empty-row="true"
              :mode="mode"
              :key-placeholder="t('k3k.policy.synchronization.storageClass.selectorKeyPlaceholder')"
              :value-placeholder="t('k3k.policy.synchronization.storageClass.selectorValuePlaceholder')"
              :read-allowed="false"
            >
              <template #add="{add}">
                <RcButton
                  v-if="!isView"
                  size="small"
                  variant="secondary"
                  :class="[addClass]"
                  data-testid="add_row_item_button"
                  :disabled="loading || disabled || (keyOptions && filteredKeyOptions.length === 0)"
                  :aria-label="t('generic.ariaLabel.addKeyValue')"
                  left-icon="plus"
                  @click="add()"
                >
                  {{ t('k3k.policy.synchronization.storageClass.addSelectorLabel') }}
                </RcButton>
              </template>
            </KeyValue>
          </div>
          <div class="col span-4">
            <RcSection
              mode="with-header"
              :expandable="false"
              type="secondary"
              class="selected-classes"
            >
              <template #title>
                {{ t('k3k.policy.synchronization.storageClass.selectedClasses') }}
                <RcCounterBadge
                  :count="matchedCount"
                  type="inactive"
                />
              </template>
              <i
                v-if="fetchingMatchingClasses"
                class="icon icon-spinner icon-spin icon-lg loading-spinner"
              />
              <span
                v-else-if="allClassesSelected"
              >
                {{ t('k3k.policy.synchronization.storageClass.addLabelsHint') }}
              </span>
              <div
                v-else
                class="selected-classes-list"
              >
                <RcTag
                  v-for="(sc, i) in targetedStorageClasses || []"
                  :key="i"
                  type="inactive"
                >
                  {{ sc.nameDisplay }}
                </RcTag>
              </div>
            </RcSection>
          </div>
        </div>

        <template #badges>
          <RcSectionBadges
            :badges="allClassesSelected ? [{ label: t('k3k.policy.synchronization.storageClass.allStorageClassesSelected', { count: matchedCount }), status: 'none' },] : [{label: t('k3k.policy.synchronization.storageClass.storageClassesSelected', { count: matchedCount }), status: 'none'}]"
          />
        </template>
      </RcSection>
    </div>
  </RcSection>
</template>

<style lang="scss" scoped>
:deep(.section-content) {
  gap: 16px;
}

.storage-selectors :deep(.rc-status-badge.none) {
  color: var(--body-text)
}

.theme-dark .storage-selectors :deep(.rc-status-badge.none) {
  background: var(--rc-inactive-background);
  border-color: var(--rc-inactive-border);
}

.theme-light .storage-selectors :deep(.rc-status-badge.none) {
  background: var(--card-badge-text);
  border-color: var(--card-badge-text);
}

.storage-row {
  position: relative;

  .col.span-4 {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 33.33%;
    overflow-y: auto;
  }
}

.storage-selectors .selected-classes {
  overflow-y: auto;
  position: relative;

  :deep(.title){
    align-items: center;
  }

  .loading-spinner {
    position: absolute;
    left: calc(50% - .5em);
    top: calc(50% + .5em);
    z-index: 1;
  }
}

.selected-classes-list {
  display: flex;
  flex-direction: column;
  :deep(.rc-tag) {
    width: fit-content;
    margin-bottom: 6px;
  }
}
</style>
