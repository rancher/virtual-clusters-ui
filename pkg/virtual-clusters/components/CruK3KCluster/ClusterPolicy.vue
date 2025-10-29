<script>
import { _CREATE } from '@shell/config/query-params';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import { LABELS, K3K } from '../../types';
import { NAMESPACE } from '@shell/config/types';
import { Banner } from '@rancher/components';
import { getProjectIds } from '../../models/k3k.io.virtualclusterpolicy';

import isEmpty from 'lodash/isEmpty';
import { PROJECT } from '@shell/config/labels-annotations';

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

    rules: {
      type:    Object,
      default: () => {}
    },
  },

  async fetch() {
    await this.fetchPolicies();
    if (this.mode !== _CREATE) {
      await this.findSelectedPolicy();
    }
  },

  data() {
    return {
      policies:                     [],
      namespaces:                   [],
      loadingPoliciesAndNamespaces: false,
      namespaceError:               false,
      policyError:                  false
    };
  },

  watch: {
    hostClusterId(neu) {
      this.$emit('update:policy', {});
      this.$emit('update:targetNamespace', '');
      if (neu) {
        this.fetchPolicies();
      }
    },

    policyOptions(neu = []) {
      const policyOpt = neu.find((p) => !!p?.value ) ;

      if (this.mode === _CREATE) {
        this.$emit('update:policy', policyOpt?.value || null);
        this.$emit('update:targetNamespace', '');
      }
    },

    namespaceOptions(neu = []) {
      if (this.mode === _CREATE && !neu.includes(this.targetNamespace)) {
        this.$emit('update:targetNamespace', neu[0] || '');
      }
    },

  },

  methods: {
    async fetchPolicies() {
      this.policyError = false;
      this.policies = [];
      if (this.hostClusterId) {
        if (this.k3kInstalled) {
          this.loadingPoliciesAndNamespaces = true;

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
        }

        return await this.fetchNamespaces();
      }
    },

    async fetchNamespaces() {
      this.namespaceError = false;
      this.namespaces = [];
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

      this.loadingPoliciesAndNamespaces = false;
    },

    // we show policies in this form but they are not saved as part of the k3k cluster spec
    // get the namespace the k3k cluster is in and check its labels to work out which policy the cluster falls under
    async findSelectedPolicy() {
      if (!this.policies.length) {
        await this.fetchPolicies();
      }

      const nsObject = this.namespaces.find((ns) => ns.id === this.targetNamespace);

      const policyName = nsObject?.metadata?.labels?.[LABELS.POLICY] || '';

      // if we can't find the policy name, the namespace may be labeled with a policy that has since been deleted
      // we should show 'none' in that case
      const policyObject = this.policies.find((p) => p?.metadata?.name === policyName);

      if (policyObject) {
        this.$emit('update:policy', policyObject);
      }
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

    namespaceIdsByProject() {
      const out = { none: [] };

      this.namespaces.forEach((ns) => {
        // the ns project annotation is formatted differently than resource ids
        // which are used in policy annotations
        const projectId = (ns.metadata?.annotations?.[PROJECT] || '').replace(':', '/') || null;

        const policyLabel = ns?.metadata?.labels[LABELS.POLICY];
        const policyInLabelExists = this.policies.find((p) => p.id === policyLabel);

        if (!policyLabel || !policyInLabelExists) {
          out.none.push(ns.id);
        } else if (!out[projectId]) {
          out[projectId] = [ns.id];
        } else {
          out[projectId].push(ns.id);
        }
      });

      return out;
    },

    policyOptions() {
      return [{ label: this.t('generic.none'), value: null }, ...this.policies.reduce((hasNs, p) => {
        const projectIds = (getProjectIds(p) || []);

        const hasNamespaces = (projectIds).find((p) => this.namespaceIdsByProject[p]);

        if (hasNamespaces) {
          hasNs.push({ label: p?.metadata?.name, value: p });
        }

        return hasNs;
      }, [])];
    },

    namespaceOptions() {
      if (!this.policy || isEmpty(this.policy)) {
        return this.namespaceIdsByProject.none;
      }

      const projectIds = getProjectIds(this.policy);

      return projectIds.reduce((nsOpts, id) => {
        nsOpts.push(...(this.namespaceIdsByProject[id] || []));

        return nsOpts;
      }, []);
    },

    showLoadingSpinner() {
      return this.loadingPoliciesAndNamespaces || this.$fetchState.pending;
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
    v-if="policyError && k3kInstalled && !showLoadingSpinner"
    color="error"
    :label="t('k3k.errors.loadingPolicies', {cluster:hostCluster?.displayName || hostCluster?.metadata?.name || '' })"
  />
  <div class="row mb-20">
    <div
      class="col span-6"
    >
      <LabeledSelect
        :value="policy && !isEmpty(policy) ? policy : t('generic.none')"
        :loading="showLoadingSpinner"
        :disabled="!hostClusterId || !k3kInstalled || !isCreate"
        :mode="mode"
        :label="t('k3k.policy.label')"
        :options="policyOptions"
        :hover-tooltip="false"
        @update:value="e=>$emit('update:policy', e)"
      />
      <span
        v-if="!policy && !showLoadingSpinner"
        class="nonepolicy-warning text-muted"
      ><i class="icon icon-warning" />{{ t('k3k.policy.noneWarning') }}</span>
    </div>
    <div class="col span-6">
      <LabeledSelect
        :value="targetNamespace"
        :loading="showLoadingSpinner"
        :mode="mode"
        :disabled="!isCreate"
        :label="t('k3k.targetNamespace.label')"
        :options="namespaceOptions"
        :rules="rules.namespace"
        :require-dirty="false"
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
