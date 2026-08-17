<script>
import { _CREATE } from '@shell/config/query-params';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import LabeledSelectWithCreate from '@shell/components/form/LabeledSelectWithCreate';
import { LABELS, K3K } from '../../types';
import { NAMESPACE } from '@shell/config/types';
import { Banner } from '@rancher/components';
import { getProjectIds } from '../../models/k3k.io.virtualclusterpolicy';
import PolicyDrawer from '../PolicyDrawer.vue';
import { useDrawer } from '@shell/composables/drawer';

import isEmpty from 'lodash/isEmpty';
import { PROJECT } from '@shell/config/labels-annotations';

export default {
  name: 'K3kPolicySelector',

  setup() {
    const { open } = useDrawer();

    return { openDrawer: open };
  },

  emits: ['update:policy', 'update:targetNamespace'],

  components: {
    LabeledSelect,
    LabeledSelectWithCreate,
    Banner
  },

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
      policyError:                  false,
      previousTargetNamespace:      ''
    };
  },

  watch: {
    hostClusterId(neu) {
      // policy is unset (not an explicit None) until we know what's available for the new host cluster
      this.$emit('update:policy', null);
      this.$emit('update:targetNamespace', '');
      if (neu) {
        this.fetchPolicies();
      }
    },

    namespaceOptions(neu = []) {
      if (this.mode !== _CREATE) {
        return;
      }

      // when there's no policy selected, let the user pick a namespace explicitly rather than presetting one
      this.$emit('update:targetNamespace', this.isPolicySelected ? (neu[0] || '') : '');
    },

  },

  methods: {
    async openPolicyDrawer() {
      if (!this.policy || isEmpty(this.policy)) {
        return;
      }

      // classify the policy being shown in the drawer
      // config form relies on functionality from the virtual cluster policy resource class
      let drawerPolicy;

      try {
        drawerPolicy = await this.$store.dispatch('management/clone', { resource: this.policy });
      } catch {
        drawerPolicy = this.policy;
      }

      this.openDrawer(PolicyDrawer, '[data-testid="k3k-policy-open-drawer"]', {
        policy:        drawerPolicy,
        parentCluster: this.hostCluster,
        showHeader:    false,
        width:         '50%'
      });
    },

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
          } catch {
            this.policies = [];
            this.policyError = true;
          }
        }

        await this.fetchNamespaces();

        if (this.mode === _CREATE) {
          this.presetPolicyIfUnambiguous();
        }
      }
    },

    // only preset the policy on create, and only when there's a single
    // unambiguous outcome - either exactly one real policy, or none at all
    // (in which case None is the only possible choice). With 2+ real
    // policies available it's left null, waiting on the user to choose.
    presetPolicyIfUnambiguous() {
      if (this.policy !== null) {
        return;
      }

      const realPolicyOptions = this.policyOptions.filter((p) => !isEmpty(p?.value));

      if (realPolicyOptions.length === 1) {
        this.$emit('update:policy', realPolicyOptions[0].value);
        this.$emit('update:targetNamespace', '');
      } else if (realPolicyOptions.length === 0) {
        this.$emit('update:policy', {});
        this.$emit('update:targetNamespace', '');
      }
    },

    async fetchNamespaces() {
      this.namespaceError = false;
      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ this.hostClusterId }/v1/${ NAMESPACE }`,
          method: 'GET'
        });

        this.namespaces = res.data || [];
      } catch {
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

      this.$emit('update:policy', policyObject || {});
    },

    isEmpty,

    onNamespaceCreating() {
      this.previousTargetNamespace = this.targetNamespace;
    },

    cancelCreateNamespace() {
      this.$emit('update:targetNamespace', this.previousTargetNamespace);
    },

    async createNamespaceIfNeeded() {
      if (!this.targetNamespace || this.namespaces.some((ns) => ns.id === this.targetNamespace)) {
        return false;
      }

      await this.$store.dispatch('management/request', {
        url:    `/k8s/clusters/${ this.hostClusterId }/v1/${ NAMESPACE }`,
        method: 'POST',
        data:   {
          apiVersion: 'v1',
          kind:       'Namespace',
          metadata:   { name: this.targetNamespace },
        },
      });

      return true;
    }
  },

  computed: {
    isCreate() {
      return this.mode === _CREATE;
    },

    hostClusterId() {
      const mgmt = this.hostCluster?.mgmt;

      return mgmt?.id;
    },

    // project-scoped RBAC only propagates into namespaces backed by a project, so only
    // users with cluster-level permissions can create resources in projectless namespaces -
    // mirrors Dashboard's own canSeeProjectlessNamespaces (ExplorerProjectsNamespaces.vue)
    canCreateInProjectlessNamespaces() {
      return !!this.hostCluster?.mgmt?.canUpdate;
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
      return [{
        label: this.t('k3k.policy.noneOption'),
        value:   {}
      }, ...this.policies.reduce((hasNs, p) => {
        const projectIds = (getProjectIds(p) || []);

        const hasNamespaces = (projectIds).find((p) => this.namespaceIdsByProject[p]);

        if (hasNamespaces) {
          hasNs.push({
            label: p?.metadata?.name,
            value:   p
          });
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
    },
    isPolicySelected() {
      return this.policy && !isEmpty(this.policy);
    },

    isNoneSelected() {
      return !!this.policy && isEmpty(this.policy);
    },

    // nothing has been chosen yet (ambiguous, waiting on the user)
    isPolicyUnset() {
      return !this.policy;
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
  <div class="row mmb-4">
    <div
      class="col span-6"
    >
      <LabeledSelect
        :value="isPolicySelected ? policy : (isNoneSelected ? t('k3k.policy.noneOption') : null)"
        :loading="showLoadingSpinner"
        :disabled="!hostClusterId || !k3kInstalled || !isCreate"
        :mode="mode"
        :label="t('k3k.policy.label')"
        :placeholder="t('k3k.policy.placeholder')"
        :options="policyOptions"
        :rules="rules.policy"
        required
        @update:value="e=>$emit('update:policy', e)"
      />
      <span
        v-if="isNoneSelected && !showLoadingSpinner"
        class="nonepolicy-warning text-deemphasized"
      ><i class="icon icon-warning" />{{ t('k3k.policy.noneWarning') }}</span>
      <button
        v-if="isPolicySelected"
        type="button"
        class="btn role-link show-policy"
        data-testid="k3k-policy-open-drawer"
        @click="openPolicyDrawer"
      >
        {{ t('k3k.policy.viewPolicy') }}
      </button>
    </div>
    <div class="col span-6">
      <LabeledSelectWithCreate
        :key="isPolicySelected"
        :value="targetNamespace"
        :loading="showLoadingSpinner"
        :mode="mode"
        :disabled="!hostClusterId || !isCreate || isPolicyUnset"
        :label="t('k3k.targetNamespace.label')"
        :options="namespaceOptions"
        :rules="rules.namespace"
        :placeholder="t('k3k.targetNamespace.placeholder')"
        :create-label="t('k3k.targetNamespace.createLabel')"
        :create-allowed="!isPolicySelected && canCreateInProjectlessNamespaces"
        required
        @update:value="e=>$emit('update:targetNamespace', e)"
        @creating="onNamespaceCreating"
        @cancel="cancelCreateNamespace"
      />
    </div>
  </div>
</template>

<style lang="scss">
.nonepolicy-warning {
  margin-top: 4px;
  display: flex;
  & i {
    margin-right: 3px;
  }
}

.show-policy {
  padding-left: 6px;
}
</style>
