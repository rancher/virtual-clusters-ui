<script>
import Select from '@shell/components/form/Select';
import UnitInput from '@shell/components/form/UnitInput';
import { ROW_COMPUTED } from '@shell/components/form/ResourceQuota/shared';

export default {
  emits: ['type-change', 'update'],

  components: { UnabeledSelect: Select, UnitInput },

  props: {
    mode: {
      type:     String,
      required: true,
    },

    types: {
      type:    Array,
      default: () => []
    },

    type: {
      type:    String,
      default: ''
    },

    value: {
      type:    Object,
      default: () => {
        return {};
      }
    }
  },

  computed: { ...ROW_COMPUTED },

  methods: {
    // delete the old type key and tell the parent component to add a new one
    updateType(type) {
      if (typeof this.value[this.type] !== 'undefined') {
        delete this.value[this.type];
      }

      this.$emit('type-change', type);
    },

    updateQuotaLimit(type, val) {
      this.value[type] = val;
      this.$emit('update');
    }
  },
};
</script>
<template>
  <div
    v-if="typeOption"
    class="row"
  >
    <UnabeledSelect
      :value="type"
      class="mr-10"
      :mode="mode"
      :options="types"
      @update:value="updateType($event)"
    />
    <UnitInput
      :value="value[type]"
      class="mr-10"
      :mode="mode"
      :placeholder="typeOption.placeholder"
      :increment="typeOption.increment"
      :input-exponent="typeOption.inputExponent"
      :base-unit="typeOption.baseUnit"
      :output-modifier="true"
      @update:value="updateQuotaLimit( type, $event)"
    />
  </div>
</template>

<style lang='scss' scoped>
  .row {
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
  }
</style>
