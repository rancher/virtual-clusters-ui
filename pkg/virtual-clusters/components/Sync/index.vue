<script>
import { _CREATE, _VIEW } from '@shell/config/query-params';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import StorageClasses from './StorageClasses.vue';

// in the cluster context storage class sync cannot be configured
export const SYNC_CONTEXT = {
  cluster: 'cluster',
  policy:  'policy'
};

export default {
  name: 'K3kResourceSync',

  emits: ['update:ingresses', 'update:priorityClasses', 'update:storageClasses', 'error'],

  components: {
    Checkbox,
    StorageClasses
  },

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    ingresses: {
      type:    Object,
      default: () => ({})
    },

    priorityClasses: {
      type:    Object,
      default: () => ({})
    },

    storageClasses: {
      type:    Object,
      default: () => ({})
    },

    context: {
      type:    String, // "cluster" or "policy"
      default: SYNC_CONTEXT.policy
    },

    parentCluster: {
      type:    Object,
      default: null
    }
  },

  computed: {
    isView() {
      return this.mode === _VIEW;
    },

    isPolicyContext() {
      return this.context === SYNC_CONTEXT.policy;
    },

    ingressesEnabled: {
      get() {
        return this.ingresses?.enabled || false;
      },
      set(neu) {
        this.$emit('update:ingresses', {
          ...this.ingresses,
          enabled: neu
        });
      }
    },

    priorityClassesEnabled: {
      get() {
        return this.priorityClasses?.enabled || false;
      },
      set(neu) {
        this.$emit('update:priorityClasses', {
          ...this.priorityClasses,
          enabled: neu
        });
      }
    },

  }
};
</script>

<template>
  <div class="row mb-10">
    <div class="col span-12">
      <t
        class="text-deemphasized"
        k="k3k.policy.synchronization.tooltip"
        raw
      />
    </div>
  </div>
  <div class="row sync-simple">
    <div class="col span-6 vertical-checkboxes">
      <Checkbox
        v-model:value="ingressesEnabled"
        :mode="mode"
        :label="t('k3k.policy.synchronization.ingressCheckbox')"
      />
      <Checkbox
        v-model:value="priorityClassesEnabled"
        :mode="mode"
        :label="t('k3k.policy.synchronization.priorityClassCheckbox')"
      />
    </div>
  </div>
  <StorageClasses
    v-if="isPolicyContext"
    :enabled="storageClasses?.enabled || false"
    :selector="storageClasses?.selector"
    :mode="mode"
    :parent-cluster="parentCluster"
    @update:enabled="$emit('update:storageClasses', { ...storageClasses, enabled: $event })"
    @update:selector="$emit('update:storageClasses', { ...storageClasses, selector: $event })"
    @error="$emit('error', $event)"
  />
</template>

<style lang="scss" scoped>
.sync-simple {
  margin-bottom: 16px;
}
</style>
