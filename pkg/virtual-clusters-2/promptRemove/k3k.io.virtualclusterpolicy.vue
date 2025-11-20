<script>
import { K3K } from '../types';
import { resourceNames } from '@shell/utils/string';
import { Banner } from '@rancher/components';
import sum from 'lodash/sum';

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
    const counts = await Promise.all(this.value.map((policy) => policy.fetchAssignedClusterCount()));

    this.assignedClusterCount = sum(counts);
  },

  data() {
    return {
      assignedClusterCount: 0,
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
      v-if="assignedClusterCount"
      class="mt-20"
      color="warning"
    >
      <t
        v-if="isBulk"
        k="k3k.policy.promptRemove.multiplePolicies"
        :count="assignedClusterCount"
      />
      <t
        v-else
        k="k3k.policy.promptRemove.onePolicy"
        :count="assignedClusterCount"
      />
    </Banner>
  </div>
</template>
