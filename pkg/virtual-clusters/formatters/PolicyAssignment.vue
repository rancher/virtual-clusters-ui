<script>
import Shortened from '@shell/components/formatter/Shortened';
import { MANAGEMENT } from '@shell/config/types';

import { ANNOTATIONS } from '../types';

const MAX_CHARS = 30; // maximum characters to show before using + n more and a tooltip to show the full list

export default {
  name: 'K3KPolicyAssignmentFormatter',

  components: { Shortened },

  props: {
    row:   {
      type:    Object,
      default: () => {
        return {};
      }
    },

    // metadata.annotations
    value: {
      type:    Array,
      default: () => []
    },

    col:   {
      type:    Object,
      default: () => {
        return {};
      }
    },
  },

  computed: {
    projectIds() {
      return this.row?.projectIds || [];
    },

    projectFullDisplayValue() {
      return this.computeDisplayValues();
    },

    projectShortDisplayValue() {
      return this.computeDisplayValues(MAX_CHARS);
    },
  },

  methods: {
    // get projects' human-readable names and make a comma-separated list
    computeDisplayValues(maxLength) {
      let out = '';
      const projectIds = this.projectIds;

      for (const p of projectIds) {
        const storeObject = this.$store.getters['management/byId'](MANAGEMENT.PROJECT, p);
        const i = projectIds.indexOf(p);

        if (!storeObject) {
          out += p;
        } else {
          out += storeObject.nameDisplay;
        }
        if (i < projectIds.length - 1) {
          if (maxLength && out.length >= maxLength) {
            out += ` ${ this.t('k3k.policy.listView.plusMore', { n: projectIds.length - i - 1 }) }`;
            break;
          }
          out += ', ';
        }
      }

      return out;
    }
  },

};
</script>

<template>
  <div>
    <span v-if="hasIncompleteAssignments">u messed up bb </span>
    <Shortened
      long-value-key="fullList"
      :row="{fullList: projectFullDisplayValue}"
      :value="projectShortDisplayValue"
    />
  </div>
</template>
