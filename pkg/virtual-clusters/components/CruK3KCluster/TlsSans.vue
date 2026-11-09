<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from 'vuex';
import { _CREATE, _VIEW } from '@shell/config/query-params';
import ArrayList from '@shell/components/form/ArrayList.vue';
import { useReportInvalidToSection } from '@components/RcSection';

type TlsSansRule = (value: unknown) => string | null | undefined;

const props = withDefaults(defineProps<{
  value?: string[];
  mode?: string;
  rules?: TlsSansRule[];
}>(), {
  value: () => [],
  mode:  _CREATE,
  rules: () => [],
});

const emit = defineEmits<{
  'update:value': [value: string[]];
}>();

const store = useStore();
const t = (key: string) => store.getters['i18n/t'](key);

// list rows only show a rule error once they have been touched
// this reports to the enclosing RcSection either way, so if this become sinvalid because another section of the form changes
// the user gets error messages
const invalid = computed(() => {
  if (props.mode === _VIEW || !props.rules.length) {
    return false;
  }

  const values = props.value?.length ? props.value : [undefined];

  return values.some((value) => props.rules.some((rule) => !!rule(value)));
});

useReportInvalidToSection(invalid);
</script>

<template>
  <div class="k3k-input-row">
    <ArrayList
      :value="value"
      :protip="false"
      :mode="mode"
      :initial-empty-row="true"
      :rules="rules"
      :required="rules.length > 0"
      :title="t('k3k.tlsSANs.label')"
      :value-placeholder="t('k3k.tlsSANs.placeholder')"
      :add-label="t('k3k.tlsSANs.addLabel')"
      add-icon="icon-plus"
      use-rc-button
      @update:value="emit('update:value', $event)"
    />
  </div>
</template>
