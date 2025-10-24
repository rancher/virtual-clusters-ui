<script>
import Shortened from '@shell/components/formatter/Shortened';
import { MANAGEMENT } from '@shell/config/types';

const MAX_CHARS = 35; // maximum characters to show before using + n more and a tooltip to show the full list

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

    // not used, but the component throws console warnings if this prop is not defined
    value: {
      type:    String,
      default: ''
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

        const toAdd = storeObject?.nameDisplay || p;

        if (maxLength && out.length + toAdd.length >= maxLength) {
          out += ` ${ this.t('k3k.policy.listView.plusMore', { n: projectIds.length - i }) }`;
          break;
        }

        out += toAdd;

        if (i < projectIds.length - 1) {
          out += ', ';
        }
      }

      return out;
    }
  },

};
</script>

<template>
  <Shortened
    long-value-key="fullList"
    :row="{fullList: projectFullDisplayValue}"
    :value="projectShortDisplayValue"
  />
</template>
