<script>
import { _CREATE, _VIEW } from '@shell/config/query-params';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import { RcContentGroup } from '@components/Layout';
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
    RcContentGroup,
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
  <RcContentGroup>
    <div class="sync-simple-checkboxes">
      <t
        class="text-deemphasized mmb-3"
        k="k3k.policy.synchronization.tooltip"
        raw
      />
      <Checkbox
        v-model:value="ingressesEnabled"
        class="mmb-2"
        :mode="mode"
        :label="t('k3k.policy.synchronization.ingressCheckbox')"
      />
      <Checkbox
        v-model:value="priorityClassesEnabled"
        :mode="mode"
        :label="t('k3k.policy.synchronization.priorityClassCheckbox')"
      />
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
  </RcContentGroup>
</template>

<style lang="scss" scoped>
  .sync-simple-checkboxes {
    display: flex;
    flex-direction: column;
  }
</style>
