<script>
import { _CREATE, _EDIT } from '@shell/config/query-params';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import { ANNOTATIONS, K3K } from '../../types';
import { mapGetters } from 'vuex';
import { NAMESPACE } from '@shell/config/types';
import { Banner } from '@rancher/components';

import debounce from 'lodash/debounce';

export default {
  name: 'K3kPolicySelector',

  emits: ['update:policyName', 'update:targetNamespace'],

  components: { LabeledSelect, Banner },

  props: {

    mode: {
      type:    String,
      default: _CREATE
    },

    // namespace in the host cluster the k3k cluster will be created in
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

    policyName: {
      type:    String,
      default: ''
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
      policies:        [],
      namespaces:      [],
      loadingPolicies: false,
      namespaceError:  false,
      policyError:     false
    };
  },

  watch: {
    hostClusterId(neu, old) {
      this.$emit('update:policyName', '');
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

    policyOptions: {
      handler: debounce(function(neu = []) {
      // by default use a policy if one exists - otherwise select 'no policy'
        const policyOpt = neu.find((p) => p !== this.t('generic.none')) || this.t('generic.none') ;

        if (this.mode === _CREATE && !neu.includes(this.policyName)) {
          this.$emit('update:policyName', policyOpt);
          this.$emit('update:targetNamespace', '');
        }
      }, 500)
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
    // get the namespace the k3k cluster is in and check its annotations to work out which policy the cluster falls under
    async findSelectedPolicy() {
      this.loadingPolicies = true; // make sure the policy dropdown doesn't show anything until we've attempted to find the relevant policy
      if (!this.policies.length) {
        await this.fetchPolicies(); // this will also fetch ns
      }

      const nsObject = this.namespaces.find((ns) => ns.id === this.targetNamespace);

      const policyName = nsObject?.metadata?.annotations?.[ANNOTATIONS.POLICY] || '';

      this.loadingPolicies = false;

      // if we can't find the policy name, the namespace may be annotated with a policy that has since been deleted
      // we should show 'none' in that case
      if (this.policies.find((p) => p?.metadata?.name === policyName)) {
        this.$emit('update:policyName', policyName);
      }

      return '';
    },
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
      return [this.t('generic.none'), ...this.policies.map((p) => p?.metadata?.name)];
    },

    policyAnnotation() {
      return { [ANNOTATIONS.POLICY]: `${ this.policyName }` };
    },

    namespaceOptions() {
      // if "no policy" is selected, show all NS without policy annotation
      if (this.policyName === this.t('generic.none') || !this.policyName) {
        return (this.namespaces || []).reduce((all, ns) => {
          if (!ns?.metadata?.annotations?.[ANNOTATIONS.POLICY]) {
            all.push(ns.id);
          }

          return all;
        }, []);
      }

      return (this.namespaces || []).reduce((all, ns) => {
        if (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policyName) {
          all.push(ns.id);
        }

        return all;
      }, []);
    },

    policy() {
      return this.policies.find((p) => p.metadata.name === this.policyName);
    },
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
    v-if="policyError"
    color="error"
    :label="t('k3k.errors.loadingPolicies', {cluster:hostCluster?.displayName || hostCluster?.metadata?.name || '' })"
  />
  <div class="row mb-20">
    <div class="col span-6">
      <LabeledSelect
        :value="policyName"
        :loading="loadingPolicies"
        :disabled="!hostClusterId || !k3kInstalled"
        :mode="mode"
        :label="t('k3k.policy.label')"
        :options="policyOptions"
        @selecting="e=>$emit('update:policyName', e)"
      />
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
