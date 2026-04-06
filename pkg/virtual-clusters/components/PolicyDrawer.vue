<script>
import Drawer from '@shell/components/Drawer/Chrome.vue';
import { _VIEW } from '@shell/config/query-params';
import { useDrawer } from '@shell/composables/drawer';

import PolicyEditor from '../edit/k3k.io.virtualclusterpolicy/index.vue';

export default {
  name: 'PolicyDrawer',

  components: {
    Drawer,
    PolicyEditor,
  },

  props: {
    policy: {
      type:    Object,
      default: () => {
        return {};
      }
    }
  },

  setup() {
    const { close } = useDrawer();

    return { closeDrawer: close };
  },

  data() {
    return { VIEW: _VIEW };
  },

  computed: {
    title() {
      return this.policy?.metadata?.name || this.$store.getters['i18n/t']('k3k.policy.label');
    }
  }
};
</script>

<template>
  <Drawer
    :aria-target="title"
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
