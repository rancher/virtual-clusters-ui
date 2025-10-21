<script>
import { _CREATE } from '@shell/config/query-params';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import { LABELS, K3K } from '../../types';
import { NAMESPACE } from '@shell/config/types';
import { Banner } from '@rancher/components';

import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';

export default {
  name: 'K3kPolicySelector',

  emits: ['update:policy', 'update:targetNamespace'],

  components: { LabeledSelect, Banner },

  props: {

    mode: {
      type:    String,
      default: _CREATE
    },

    targetNamespace: {
      type:    String,
      default: ''
    },

    hostCluster: {
      type:    Object,
      default: () => {
        return {};
      }
    },

    k3kInstalled: {
      type:    Boolean,
      default: false
    },

    policy: {
      type:    Object,
      default: () => {
        return {};
      }
    },
  },

  created() {
    this.fetchPolicies();
    if (this.mode !== _CREATE) {
      this.findSelectedPolicy();
    }
  },

  data() {
    return {
      policies:          [],
      namespaces:        [],
      loadingPolicies:   false,
      loadingNamespaces:  false,
      namespaceError:    false,
      policyError:       false
    };
  },

  watch: {
    hostClusterId(neu, old) {
      this.$emit('update:policy', {});
      this.$emit('update:targetNamespace', '');
      if (neu && this.k3kInstalled) {
        this.fetchPolicies();
      }
    },

    k3kInstalled(neu) {
      if (neu) {
        this.fetchPolicies();
      }
    },

    policyOptions(neu = []) {
      const policyOpt = neu.find((p) => !!p?.value ) || null ;

      if (this.mode === _CREATE) {
        this.$emit('update:policy', policyOpt);
        this.$emit('update:targetNamespace', '');
      }
    },

    namespaceOptions(neu = []) {
      if (this.mode === _CREATE && !neu.includes(this.targetNamespace)) {
        this.$emit('update:targetNamespace', neu[0] || '');
      }
    }
  },

  methods: {
    async fetchPolicies() {
      if (this.hostClusterId) {
        this.loadingPolicies = true;
        this.policyError = false;

        this.policies = [];

        try {
          const res = await this.$store.dispatch('management/request', {
            url:    `/k8s/clusters/${ this.hostClusterId }/v1/${ K3K.POLICY }`,
            method: 'GET'
          });

          this.policies = res.data || [];
        } catch (err) {
          this.policies = [];
          this.policyError = true;
        }

        this.loadingPolicies = false;

        return await this.fetchNamespaces();
      }
    },

    async fetchNamespaces() {
      this.loadingNamespaces = true;
      this.namespaceError = false;

      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ this.hostClusterId }/v1/${ NAMESPACE }`,
          method: 'GET'
        });

        this.namespaces = res.data || [];
      } catch (e) {
        this.namespaces = [];
        this.namespaceError = true;
      }

      this.loadingNamespaces = false;
    },

    // we show policies in this form but they are not saved as part of the k3k cluster spec
    // get the namespace the k3k cluster is in and check its labels to work out which policy the cluster falls under
    async findSelectedPolicy() {
      this.loadingPolicies = true;
      if (!this.policies.length) {
        await this.fetchPolicies();
      }

      const nsObject = this.namespaces.find((ns) => ns.id === this.targetNamespace);

      const policyName = nsObject?.metadata?.labels?.[LABELS.POLICY] || '';

      this.loadingPolicies = false;

      // if we can't find the policy name, the namespace may be labeled with a policy that has since been deleted
      // we should show 'none' in that case
      const policyObject = this.policies.find((p) => p?.metadata?.name === policyName);

      if (policyObject) {
        this.$emit('update:policy', policyObject);
      }

      return '';
    },

    isEmpty
  },

  computed: {
    isCreate() {
      return this.mode === _CREATE;
    },

    hostClusterId() {
      const mgmt = this.hostCluster?.mgmt;

      return mgmt?.id;
    },

    policyOptions() {
      return [{ label: this.t('generic.none'), value: null }, ...this.policies.map((p) => {
        return { label: p?.metadata?.name, value: p };
      })];
    },

    namespaceOptions() {
      // if "no policy" is selected, show all NS without policy label
      if ( !this.policy) {
        return (this.namespaces || []).reduce((all, ns) => {
          if (!ns?.metadata?.labels?.[LABELS.POLICY]) {
            all.push(ns.id);
          }

          return all;
        }, []);
      }

      return (this.namespaces || []).reduce((all, ns) => {
        if (ns?.metadata?.labels?.[LABELS.POLICY] === this.policy?.metadata?.name) {
          all.push(ns.id);
        }

        return all;
      }, []);
    }
  },
};

</script>

<template>
  <Banner
    v-if="namespaceError"
    color="error"
    :label="t('k3k.errors.loadingNamespaces', {cluster:hostCluster?.displayName || hostCluster?.metadata?.name || '' })"
  />
  <Banner
    v-if="policyError && k3kInstalled"
    color="error"
    :label="t('k3k.errors.loadingPolicies', {cluster:hostCluster?.displayName || hostCluster?.metadata?.name || '' })"
  />
  <div class="row mb-20">
    <div class="col span-6">
      <LabeledSelect
        :value="policy && !isEmpty(policy) ? policy : t('generic.none')"
        :loading="loadingPolicies"
        :disabled="!hostClusterId || !k3kInstalled || !isCreate"
        :mode="mode"
        :label="t('k3k.policy.label')"
        :options="policyOptions"
        :hover-tooltip="false"
        @selecting="e=>$emit('update:policy', e)"
      />
      <span
        v-if="!policy && !loadingPolicies && k3kInstalled"
        class="nonepolicy-warning text-muted"
      ><i class="icon icon-warning" />{{ t('k3k.policy.noneWarning') }}</span>
    </div>
    <div class="col span-6">
      <LabeledSelect
        :value="targetNamespace"
        :loading="loadingNamespaces || loadingPolicies"
        :mode="mode"
        :disabled="!isCreate"
        :label="t('k3k.targetNamespace.label')"
        :options="namespaceOptions"
        @selecting="e=>$emit('update:targetNamespace', e)"
      />
    </div>
  </div>
</template>

<style lang="scss">
.nonepolicy-warning {
  margin: 3px;
  display: flex;
  & i {
    margin-right: 3px;
  }
}
</style>
