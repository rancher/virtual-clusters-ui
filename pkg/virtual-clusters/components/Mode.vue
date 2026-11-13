<script>
import { mapGetters } from 'vuex';
import RadioButton from '@components/Form/Radio/RadioButton.vue';
import { _CREATE } from '@shell/config/query-params';

export const MODES = {
  SHARED:  'shared',
  VIRTUAL: 'virtual',
  HCP:     'hcp'
};

export default {
  name: 'CRUK3KMode',

  emits: ['update:k3k-mode'],

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    k3kMode: {
      type:    String,
      default: MODES.SHARED
    },

    hcpSupported: {
      type:    Boolean,
      default: true
    }
  },

  components: { RadioButton },

  data() {
    return { modes: MODES };
  },

  computed: {
    ...mapGetters({ t: 'i18n/t' }),

    isCreate() {
      return this.mode === _CREATE;
    },

    modeOptions() {
      // a saved hcp resource keeps its option so the form can show its mode
      return Object.values(MODES).filter((option) => option !== MODES.HCP || this.hcpSupported || this.k3kMode === MODES.HCP);
    },

    tooltipKey() {
      return this.modeOptions.includes(MODES.HCP) ? 'k3k.mode.tooltip' : 'k3k.mode.tooltipNoHcp';
    }
  }
};
</script>

<template>
  <div class="k3k-input-row">
    <div>
      <h3>{{ t('k3k.mode.label') }}</h3>
      <h5 class="text-deemphasized">
        <t
          :k="tooltipKey"
          :raw="true"
        />
      </h5>
      <div
        role="radiogroup"
        :aria-label="t('k3k.mode.label')"
        class="radio-group"
        data-testid="k3k-mode"
      >
        <RadioButton
          v-for="option in modeOptions"
          :key="option"
          :val="option"
          :value="k3kMode"
          name="k3k-cluster-mode"
          :mode="mode"
          :disabled="!isCreate"
          :label="t(`k3k.mode.${option}.label`)"
          @update:value="e=>$emit('update:k3k-mode', e)"
        >
          <template #label>
            <span class="text">{{ t(`k3k.mode.${option}.label`) }}</span>
            <div class="text-deemphasized description">
              {{ t(`k3k.mode.${option}.description`) }}
            </div>
          </template>
        </RadioButton>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--gap);

  .text {
    color: var(--body-text);
  }

  .description {
    font-size: 12px;
  }

  & :deep(.radio-container) {
     padding-bottom: 0px;
  }
}

</style>
