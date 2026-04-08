<script>
import { computed, defineComponent } from 'vue';
import { useStore } from 'vuex';
import Drawer from '@shell/components/Drawer/Chrome.vue';
import { _VIEW } from '@shell/config/query-params';
import { useDrawer } from '@shell/composables/drawer';

import PolicyEditor from '../edit/k3k.io.virtualclusterpolicy/index.vue';

export default defineComponent({
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

  setup(props) {
    const store = useStore();
    const { close } = useDrawer();

    const title = computed(() => {
      return props.policy?.metadata?.name || store.getters['i18n/t']('k3k.policy.label');
    });

    return {
      VIEW:        _VIEW,
      closeDrawer: close,
      title,
    };
  },
});
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
