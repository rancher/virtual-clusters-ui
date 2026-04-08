<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from 'vuex';
import Drawer from '@shell/components/Drawer/Chrome.vue';
import { _VIEW } from '@shell/config/query-params';
import { useDrawer } from '@shell/composables/drawer';

import PolicyEditor from '../edit/k3k.io.virtualclusterpolicy/index.vue';
import type { K3kPolicy } from '../types/k3k';

const props = withDefaults(defineProps<{ policy?: K3kPolicy }>(), { policy: () => ({}) });

const VIEW = _VIEW;
const store = useStore();
const { close } = useDrawer();

const title = computed(() => {
  return props.policy?.metadata?.name || store.getters['i18n/t']('k3k.policy.label');
});

const closeDrawer = close;
</script>

<template>
  <Drawer
    v-bind="{ ariaTarget: title }"
    @close="closeDrawer"
  >
    <template #title>
      {{ title }}
    </template>
    <template #body>
      <PolicyEditor
        :value="policy"
        :mode="VIEW"
      />
    </template>
  </Drawer>
</template>

<style lang='scss' scoped>
  :deep(.resource-tabs) {
    margin-top: 0;
  }
</style>
