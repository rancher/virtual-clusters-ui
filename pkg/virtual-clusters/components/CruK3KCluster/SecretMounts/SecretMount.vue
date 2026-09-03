<script setup lang="ts">
import { useStore } from 'vuex';
import { useI18n } from '@shell/composables/useI18n';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import RadioGroup from '@components/Form/Radio/RadioGroup.vue';
import type { SecretMountRole } from '../../../types/k3k';

const store = useStore();
const { t: tn } = useI18n(store); // importing 't' here breaks the t tag in template

defineProps<{
  mode: string;
  secretName: string;
  mountPath: string;
  subPath: string;
  role: SecretMountRole;
  secrets: string[];
  loadingSecrets: boolean;
}>();

const emit = defineEmits<{
  'update:secretName': [value: string];
  'update:mountPath': [value: string];
  'update:subPath': [value: string];
  'update:role': [value: SecretMountRole];
}>();

const roleOptions: { label: string; value: SecretMountRole }[] = [
  {
    label: tn('k3k.secretMounts.role.all'),
    value: 'all'
  },
  {
    label: tn('k3k.secretMounts.role.server'),
    value: 'server'
  },
  {
    label: tn('k3k.secretMounts.role.agent'),
    value: 'agent'
  },
];
</script>

<template>
  <div class="col span-6">
    <LabeledSelect
      :value="secretName"
      label-key="k3k.secretMounts.secretName.label"
      :placeholder="t('k3k.secretMounts.secretName.placeholder')"
      :options="secrets"
      :loading="loadingSecrets"
      :mode="mode"
      :reduce="(s: string) => s"
      @update:value="emit('update:secretName', $event)"
    />
  </div>
  <div>
    <div class="col span-6">
      <LabeledInput
        :value="mountPath"
        label-key="k3k.secretMounts.mountPath.label"
        placeholder-key="k3k.secretMounts.mountPath.placeholder"
        :mode="mode"
        @update:value="emit('update:mountPath', $event)"
      />
    </div>
    <div class="input-description mmt-1">
      <t
        k="k3k.secretMounts.mountPath.description"
        raw
      />
    </div>
  </div>
  <div>
    <div class="col span-6">
      <LabeledInput
        :value="subPath"
        label-key="k3k.secretMounts.subPath.label"
        placeholder-key="k3k.secretMounts.subPath.placeholder"
        :mode="mode"
        @update:value="emit('update:subPath', $event)"
      />
    </div>
    <div class="input-description mmt-1">
      <t
        k="k3k.secretMounts.subPath.description"
        raw
      />
    </div>
  </div>

  <div class="col span-12">
    <RadioGroup
      :value="role || 'all'"
      label-key="k3k.secretMounts.role.label"
      :options="roleOptions"
      :mode="mode"
      name="secretMountRole"
      @update:value="emit('update:role', $event)"
    >
      <template #label>
        <h4>
          {{ t('k3k.secretMounts.role.label') }}
        </h4>
        <t
          k="k3k.secretMounts.role.description"
          raw
        />
      </template>
    </RadioGroup>
  </div>
</template>

<style scoped>
.input-description {
    font-size: 12px;
}

:deep(.radio-group h4),:deep(.radio-group.label){
    margin-bottom: 8px;
}
</style>
