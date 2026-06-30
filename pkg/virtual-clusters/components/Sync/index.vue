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

  emits: ['update:sync', 'error'],

  components: { Checkbox, StorageClasses },

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    sync: {
      type:    Object,
      default: () => {
        return {};
      }
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
        return this.sync?.ingresses?.enabled || false;
      },
      set(neu) {
        const out = { ...this.sync };

        if (!out.ingresses) {
          out.ingresses = {};
        }
        out.ingresses.enabled = neu;
        this.$emit('update:sync', out );
      }
    },

    priorityClassesEnabled: {
      get() {
        return this.sync?.priorityClasses?.enabled || false;
      },
      set(neu) {
        const out = { ...this.sync };

        if (!out.priorityClasses) {
          out.priorityClasses = {};
        }
        out.priorityClasses.enabled = neu;

        this.$emit('update:sync', out );
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
    :storage-classes-sync="sync.storageClasses"
    :mode="mode"
    :parent-cluster="parentCluster"
    @update:storage-classes-sync="$emit('update:sync', { ...sync, storageClasses: $event })"
    @error="$emit('error', $event)"
  />
</template>

<style lang="scss" scoped>
.sync-simple {
  margin-bottom: 16px;
}
</style>
