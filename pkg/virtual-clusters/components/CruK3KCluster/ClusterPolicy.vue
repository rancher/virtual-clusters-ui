<script>
import { _CREATE, _EDIT } from '@shell/config/query-params';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import { ANNOTATIONS, K3K } from '../../types';
import { mapGetters } from 'vuex';
import { NAMESPACE } from '@shell/config/types';

import debounce from 'lodash/debounce';

export default {
  name: 'K3kPolicySelector',

  emits: ['update:policyName', 'update:targetNamespace'],

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
      type:    String,
      default: ''
    },

    k3kInstalled: {
      type:    Boolean,
      default: false
    },

    // TODO nb need to check ns annotations to find this on edit
    policyName: {
      type:    String,
      default: ''
    },
  },

  created() {
    this.fetchPolicies();
  },

  data() {
    return {
      policies:        [],
      namespaces:      [],
      loadingPolicies: false,
    };
  },

  components: { LabeledSelect },

  watch: {
    clusterReady(neu, old) {
      this.$emit('update:policyName', '');
      this.$emit('update:targetNamespace', '');
      if (neu && this.k3kInstalled) {
        this.fetchPolicies();
        this.namespaces = this.$store.getters['cluster/all'](NAMESPACE);
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
      this.loadingPolicies = true;
      this.policies = [];

      try {
        this.policies = await this.$store.dispatch('cluster/findAll', { type: K3K.POLICY });
      } catch (err) {
        // TODO nb tell user they have permission issue w/ selected cluster?
        this.policies = [];
      }

      this.loadingPolicies = false;
    },

    openDrawer() {
      if (this.policy) {
        this.policy.showConfiguration();
      }
    }
  },

  computed: {
    ...mapGetters(['clusterReady']),

    policyOptions() {
      return [this.t('generic.none'), ...this.policies.map((p) => p?.metadata?.name)];
    },

    policyAnnotation() {
      return { [ANNOTATIONS.POLICY]: `${ this.policyName }` };
    },

    namespaceOptions() {
      // if "no policy" is selected, show all NS without policy annotation
      // TODO nb maybe hide system ns?
      if (this.policyName === this.t('generic.none') || !this.policyName) {
        return (this.namespaces || []).reduce((all, ns) => {
          if (!ns?.metadata?.annotations?.[ANNOTATIONS.POLICY]) {
            all.push(ns.id);
          }

          return all;
        }, []);
      }

      // TODO nb permission on each ns...?
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
  <div class="row mb-20">
    <div class="col span-6">
      <LabeledSelect
        :value="policyName"
        :loading="loadingPolicies || !clusterReady"
        :disabled="!hostCluster || !k3kInstalled"
        :mode="mode"
        :label="t('k3k.policy.label')"
        :options="policyOptions"
        @selecting="e=>$emit('update:policyName', e)"
      />
      <!-- <span
        v-if="policyName && policyName !== t('generic.none')"
        @click="openDrawer"
      >show policy detail</span> -->
    </div>
    <div class="col span-6">
      <LabeledSelect
        :value="targetNamespace"
        :disabled="!clusterReady || !policyName"
        :mode="mode"
        :label="t('k3k.targetNamespace.label')"
        :options="namespaceOptions"
        @selecting="e=>$emit('update:targetNamespace', e)"
      />
    </div>
  </div>
</template>
