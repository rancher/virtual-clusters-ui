<script>
import { _CREATE } from '@shell/config/query-params';
import Checkbox from '@components/Form/Checkbox/Checkbox';

export default {
  name: 'K3kResourceSync',

  emits: ['update:sync'],

  components: { Checkbox },

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
    }
  },

  computed: {
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
    }
  }
};
</script>

<template>
  <div class="row mb-10">
    <div class="col span-12">
      <h3>{{ t('k3k.policy.synchronization.label') }}</h3>
      <t
        class="text-muted"
        k="k3k.policy.synchronization.tooltip"
        raw
      />
    </div>
  </div>
  <div class="row mb-20">
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
</template>
