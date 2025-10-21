<script>
import { K3K } from '../types';
import { resourceNames } from '@shell/utils/string';
import { Banner } from '@rancher/components';

export default {
  name: 'VirtualClusterPolicyPromptRemove',

  components: { Banner },

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
    this.value.forEach(async(policy) => {
      const assigned = await policy.findAssignedClusters();

      if (assigned && assigned.length) {
        this.assignedClusters.push(...assigned);
      }
    });
  },

  data() {
    return {
      assignedClusters: [],
      K3K,
    };
  },

  methods: {
    resourceNames() {
      return resourceNames(this.names, null, this.$store.getters['i18n/t']);
    }
  },

  computed: {
    isBulk() {
      return this.value?.length && this.value?.length > 1;
    }
  },
};
</script>

<template>
  <div>
    {{ t('promptRemove.attemptingToRemove', { type: K3K.POLICY }) }} <span
      v-clean-html="resourceNames(names, null, t)"
    />

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
