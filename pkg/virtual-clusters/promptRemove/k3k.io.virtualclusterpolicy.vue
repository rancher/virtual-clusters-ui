<script>
import { K3K } from '../types';
import { resourceNames } from '@shell/utils/string';
import { Banner } from '@rancher/components';
import Loading from '@shell/components/Loading';

export default {
  name: 'VirtualClusterPolicyPromptRemove',

  components: { Banner, Loading },

  props: {
    value: {
      type:    Array,
      default: () => []
    },
    names: {
      type:    Array,
      default: () => []
    },

  },

  async fetch() {
    for (const policy of this.value) {
      try {
        const assigned = await policy.findAssignedClusters();

        if (assigned && assigned.length) {
          this.assignedClusters.push(...assigned);
        }
      } catch {
        // if users can't load virtual clusters, they will see a generic deletion warning instead
      }
    }
  },

  data() {
    return {
      assignedClusters: [],
      K3K,
    };
  },

  computed: {
    isBulk() {
      return this.value?.length && this.value?.length > 1;
    },

    resourceNames() {
      return resourceNames(this.names, null, this.$store.getters['i18n/t']);
    }
  },
};
</script>

<template>
  <div>
    {{ t('promptRemove.attemptingToRemove', { type: K3K.POLICY }) }} <span v-clean-html="resourceNames" />

    <Banner
      v-if="assignedClusters.length"
      class="mt-20"
      color="warning"
    >
      <t
        v-if="isBulk"
        k="k3k.policy.promptRemove.multiplePolicies"
        :count="assignedClusters?.length"
      />
      <t
        v-else
        k="k3k.policy.promptRemove.onePolicy"
        :count="assignedClusters?.length"
      />
    </Banner>
  </div>
</template>
