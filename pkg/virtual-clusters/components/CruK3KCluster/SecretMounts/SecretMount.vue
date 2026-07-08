<script setup lang="ts">
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import RadioGroup from '@components/Form/Radio/RadioGroup.vue';
import type { SecretMount, SecretMountRole } from '../../../types/k3k';

const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

const props = defineProps<{
  mode: string;
  secretMount: SecretMount;
  secrets: string[];
  loadingSecrets: boolean;
}>();

const emit = defineEmits<{
  'update:secretMount': [value: SecretMount];
  'remove': [];
}>();

const roleOptions: { label: string; value: SecretMountRole }[] = [
  { label: 'All', value: 'all' },
  { label: 'Server', value: 'server' },
  { label: 'Agent', value: 'agent' },
];

// const nameRules = computed(() => {
//   const rules: Array<(val: string) => string | undefined> = [];

//   rules.push((val: string) => {
//     if (val && val.length > 63) {
//       return 'Name must be at most 63 characters';
//     }
//   });

//   rules.push((val: string) => {
//     if (val && !NAME_PATTERN.test(val)) {
//       return 'Name must consist of lowercase alphanumeric characters or dashes, and must start and end with an alphanumeric character';
//     }
//   });

//   return rules;
// });

function update(field: keyof SecretMount, value: unknown) {
  emit('update:secretMount', { ...props.secretMount, [field]: value });
}
</script>

<template>
  <div class="col span-6">
    <LabeledSelect
      :value="secretMount.secretName"
      label-key="k3k.secretMounts.secretName.label"
      :placeholder="t('k3k.secretMounts.secretName.placeholder')"
      :options="secrets"
      :loading="loadingSecrets"
      :mode="mode"
      :reduce="(s: string) => s"
      @update:value="update('secretName', $event)"
    />
  </div>
  <div>
    <div class="col span-6">
      <LabeledInput
        :value="secretMount.mountPath"
        label-key="k3k.secretMounts.mountPath.label"
        placeholder-key="k3k.secretMounts.mountPath.placeholder"
        :mode="mode"
        @update:value="update('mountPath', $event)"
      />
    </div>
    <t
      k="k3k.secretMounts.mountPath.description"
      class="input-description"
      raw
    />
  </div>
  <div>
    <div class="col span-6">
      <LabeledInput
        :value="secretMount.subPath"
        label-key="k3k.secretMounts.subPath.label"
        placeholder-key="k3k.secretMounts.subPath.placeholder"
        :mode="mode"
        @update:value="update('subPath', $event)"
      />
    </div>
    <t
      k="k3k.secretMounts.subPath.description"
      class="input-description"
      raw
    />
  </div>

  <div class="col span-12">
    <RadioGroup
      :value="secretMount.role || 'all'"
      label-key="k3k.secretMounts.role.label"
      :options="roleOptions"
      :mode="mode"
      name="secretMountRole"
      @input="update('role', $event)"
    />
  </div>
</template>

<style scoped>
.input-description {
    font-size: 12px;
}
</style>
