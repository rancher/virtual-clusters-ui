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
      return Object.values(MODES);
    }
  }
};
</script>

<template>
  <div class="input-row">
    <div>
      <h3>{{ t('k3k.mode.label') }}</h3>
      <h5 class="text-deemphasized">
        <t
          k="k3k.mode.tooltip"
          :raw="true"
        />
      </h5>
      <div
        role="radiogroup"
        :aria-label="t('k3k.mode.label')"
        class="radio-group"
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
            <div class="text-deemphasized">
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

  & :deep(.radio-container) {
     padding-bottom: 0px;
  }
}

</style>
