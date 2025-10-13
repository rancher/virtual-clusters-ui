<script>
import ArrayList from '@rancher/shell/components/form/ArrayList';
import Row from './QuotaRow';
import { QUOTA_COMPUTED } from '@rancher/shell/components/form/ResourceQuota/shared';

export default {
  emits: ['remove', 'update:value'],

  components: { ArrayList, Row },

  props: {
    mode: {
      type:     String,
      required: true,
    },
    // corev1.resourcequota.spec.hard
    value: {
      type:    Object,
      default: () => {
        return {};
      }
    },
    types: {
      type:    Array,
      default: () => {
        return [];
      }
    }
  },

  data() {
    return { typeValues: [] };
  },

  created() {
    this.typeValues = Object.keys(this.value);
  },

  computed: { ...QUOTA_COMPUTED },

  methods: {
    updateType(i, type) {
      this.typeValues[i] = type;
    },
    remainingTypes(currentType) {
      return this.mappedTypes
        .filter((mappedType) => !this.typeValues.includes(mappedType.value) || mappedType.value === currentType);
    },
    emitRemove(data) {
      this.$emit('remove', data.row?.value);
    }
  },
};
</script>
<template>
  <div>
    <div class="headers mb-10">
      <div class="mr-10">
        <label>{{ t('k3k.policy.quota.headers.resourceType') }}</label>
      </div>
      <div class="mr-20">
        <label>{{ t('k3k.policy.quota.headers.clusterSetLimit') }}</label>
      </div>
    </div>
    <ArrayList
      :value="value"
      label="Resources"
      :add-label="t('resourceQuota.add.label')"
      :default-add-value="remainingTypes()[0] ? remainingTypes()[0].value : ''"
      :add-allowed="remainingTypes().length > 0"
      :mode="mode"
      @update="$emit('update:value')"
      @remove="emitRemove"
    >
      <template #columns="props">
        <Row
          :value="value"
          :mode="mode"
          :types="remainingTypes(typeValues[props.i])"
          :type="typeValues[props.i]"
          @input="$emit('input', $event)"
          @type-change="updateType(props.i, $event)"
        />
      </template>
    </ArrayList>
  </div>
</template>
<style lang="scss" scoped>
.headers {
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    align-items: center;
    border-bottom: 1px solid var(--border);
    height: 30px;
    width: calc(100% - 75px);

    div {
        width: 100%;
    }
}
</style>
