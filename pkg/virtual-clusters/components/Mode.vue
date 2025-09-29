<script>
import { mapGetters } from 'vuex';
import RadioGroup from '@components/Form/Radio/RadioGroup.vue';
import { _CREATE } from '@shell/config/query-params';

export const MODES = {
  SHARED:  'shared',
  VIRTUAL: 'virtual'
};

export default {
  name: 'CRUK3KMode',

  emits: ['update:k3kMode'],

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    k3kMode: {
      type:    String,
      default: MODES.SHARED
    }
  },

  components: { RadioGroup },

  data() {
    return { modes: MODES };
  },

  computed: { ...mapGetters({ t: 'i18n/t' }) }
};
</script>

<template>
  <div
    class="row mb-20"
  >
    <div class="col span-6">
      <RadioGroup
        :value="k3kMode"
        name="k3k-cluster-mode"
        :row="true"
        :mode="mode"
        label-key="k3k.mode.label"
        :options="[{label: t('k3k.mode.shared'), value: modes.SHARED},{label: t('k3k.mode.virtual'), value: modes.VIRTUAL} ]"
        @update:value="e=>$emit('update:k3kMode', e)"
      >
        <template #label>
          <h4>{{ t('k3k.mode.label') }}</h4>
        </template>
      </RadioGroup>
    </div>
    <div class="col span-6">
      <span class="text-label">{{ t('k3k.mode.tooltip') }}</span>
    </div>
  </div>
</template>
