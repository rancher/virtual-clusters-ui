<script>
import { _CREATE } from '@shell/config/query-params';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import { ANNOTATIONS, K3K } from '../../types';
import { mapGetters } from 'vuex';
import { NAMESPACE } from '@shell/config/types';

export default {
  name: 'K3kPolicySelector',

  emits: ['update:policyName', 'update:targetNamespace'],

  props: {

    mode: {
      type:    String,
      default: _CREATE
    },

    // // virtual cluster policy name
    // policyName: {
    //   type:    String,
    //   default: ''
    // },

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
  },

  data() {
    return {
      // TODO nb need to check ns annotations to find this on edit
      policyName:      '',
      policies:        [],
      namespaces:      [],
      loadingPolicies: false,
    };
  },

  components: { LabeledSelect },

  watch: {
    clusterReady(neu, old) {
      this.policyName = '';
      this.$emit('update:targetNamespace', '');
      if (!neu && old) {
        // TODO nb clear policy and ns selection
      }
      if (neu && this.k3kInstalled) {
        this.fetchPolicies();
        this.namespaces = this.$store.getters['cluster/all'](NAMESPACE);
      }
    },

    // async policyName(neu) {
    //   if ( neu) {
    //     this.namespaces = await this.$store.dispatch('cluster/findLabelSelector', { type: NAMESPACE, matching: { labelSelector: { matchAnnotations: this.policyAnnotation } } });
    //   }
    // },
  },

  methods: {
    async fetchPolicies() {
      this.loadingPolicies = true;
      try {
        this.policies = await this.$store.dispatch('cluster/findAll', { type: K3K.POLICY });
      } catch (err) {
        // TODO nb tell user they have permission issue w/ selected cluster?
        this.policies = [];
      }

      this.loadingPolicies = false;
    }
  },

  computed: {
    ...mapGetters(['clusterReady']),

    policyOptions() {
      return this.policies.map((p) => p?.metadata?.name);
    },

    policyAnnotation() {
      return { [ANNOTATIONS.POLICY]: `${ this.policyName }` };
    },

    namespaceOptions() {
      // TODO nb permission on each ns...?
      // TODO nb namespaces without annotation when none option
      return (this.namespaces || []).reduce((all, ns) => {
        if (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policyName) {
          all.push(ns.id);
        }

        return all;
      }, []);
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
        @selecting="e=>policyName=e"
      />
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
