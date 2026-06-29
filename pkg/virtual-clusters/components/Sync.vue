<script>
import { _CREATE, _VIEW } from '@shell/config/query-params';
import KeyValue from '@shell/components/form/KeyValue.vue';
import ButtonGroup from '@rancher/shell/components/ButtonGroup';
import RcSection from '@rancher/shell/rancher-components/RcSection/RcSection';
import Checkbox from '@components/Form/Checkbox/Checkbox';

export default {
  name: 'K3kResourceSync',

  emits: ['update:sync'],

  components: {
    RcSection, Checkbox, KeyValue, ButtonGroup
  },

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
    isView() {
      return this.mode === _VIEW;
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

    storageClassEnabled: {
      get() {
        return this.sync?.storageClasses?.enabled || false;
      },
      set(neu) {
        const out = { ...this.sync };

        if (!out.storageClasses) {
          out.storageClasses = {};
        }
        out.storageClasses.enabled = neu;

        this.$emit('update:sync', out );
      }
    },

    storageClassSelector: {
      get() {
        return this.sync?.storageClasses?.selector || {};
      },
      set(neu) {
        const out = { ...this.sync };

        if (!out.storageClasses) {
          out.storageClasses = {};
        }
        out.storageClasses.selector = neu;

        this.$emit('update:sync', out );
      }
    },

    useStorageClassSelector: {
      get() {
        const selector = this.sync?.storageClasses?.selector;

        return !!selector;
      },
      set(neu) {
        const out = { ...this.sync };

        if (!out.storageClasses) {
          out.storageClasses = {};
        }

        if (neu) {
          out.storageClasses.selector = out.storageClasses.selector || {};
        } else {
          delete out.storageClasses.selector;
        }

        this.$emit('update:sync', out );
      }
    },

    storageClassSelectorOptions() {
      return [
        {
          labelKey: 'k3k.policy.synchronization.storageClass.allStorageClasses',
          value:    false
        },
        {
          labelKey: 'k3k.policy.synchronization.storageClass.manuallySelectStorageClasses',
          value:    true
        }
      ];
    }
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
    <div
      v-if="storageClassEnabled"
    >
      <ButtonGroup
        v-model:value="useStorageClassSelector"
        :options="storageClassSelectorOptions"
        :disabled="isView"
        active-class="role-secondary"
      />
      <RcSection
        v-if="useStorageClassSelector"
        class="mt-20"
        :title="t('k3k.policy.synchronization.storageClass.selectByLabel')"
        mode="with-header"
        :expandable="true"
        type="secondary"
      >
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
      </RcSection>
    </div>
  </RcSection>
</template>
