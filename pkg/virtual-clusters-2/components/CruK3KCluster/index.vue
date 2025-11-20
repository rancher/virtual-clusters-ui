<script>
import { mapGetters } from 'vuex';
import cloneDeep from 'lodash/cloneDeep';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import NameNsDescription from '@shell/components/form/NameNsDescription';

import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import Labels from '@shell/components/form/Labels';
import ArrayList from '@shell/components/form/ArrayList';

import KeyValue from '@shell/components/form/KeyValue.vue';
import { Banner } from '@components/Banner';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import ClusterAppearance from '@shell/components/form/ClusterAppearance';
import Tab from '@shell/components/Tabbed/Tab';
import Tabbed from '@shell/components/Tabbed';

import ClusterMembershipEditor, { canViewClusterMembershipEditor } from '@shell/components/form/Members/ClusterMembershipEditor';
import { CAPI, MANAGEMENT } from '@shell/config/types';
import CreateEditView from '@shell/mixins/create-edit-view';
import FormValidation from '@shell/mixins/form-validation';
import { _CREATE, _VIEW } from '@shell/config/query-params';
import { allHash } from '@shell/utils/promise';
import { CLUSTER_BADGE } from '@shell/config/labels-annotations';

import { K3K } from '../../types';
import InstallK3k from '../InstallK3k.vue';
import Networking from './Networking.vue';
import Storage from './Storage.vue';
import ClusterPolicy from './ClusterPolicy.vue';
import Mode from '../Mode.vue';
import Sync from '../Sync.vue';

import importConfigMapTemplate from '../../resources/import-configmap.json';
import importJobTemplate from '../../resources/import-job.json';
import merge from 'lodash/merge';

const defaultCluster = {
  type:       K3K.CLUSTER,
  apiVersion: 'k3k.io/v1beta1',
  kind:       'Cluster',
  metadata:   { name: '', namespace: '' },
  spec:       {
    mode:        'shared',
    agents:      0,
    persistence: {
      storageRequestSize: '5Gi',
      type:               'dynamic',
    },
    servers:      1,
    nodeSelector: {},
    sync:         {}
  }
};

/**
 * provisioning.cattle.io.cluster default annotations
 *
 * also set before creation:
 * 'ui.rancher/parent-cluster' - host cluster's norman cluster id
 * 'ui.rancher/parent-cluster-display' - host cluster provisioning cluster displayName model property
 * 'ui.rancher/k3k-namespace'  - namespace of the k3k cluster in the host cluster
 */
const defaultAnnotations = {
  // prevent k3s-upgrade-controller from running: this will be managed by k3k
  'rancher.io/imported-cluster-version-management': 'false',
  // display machine provider in cluster mgmt list
  'ui.rancher/provider':                            'k3k'
};

export default {
  emits: ['update:value'],

  components: {
    LabeledSelect,
    NameNsDescription,
    CruResource,
    Loading,
    Labels,
    ClusterMembershipEditor,
    Banner,
    LabeledInput,
    KeyValue,
    ClusterAppearance,
    InstallK3k,
    Tabbed,
    Tab,
    Networking,
    Storage,
    ArrayList,
    ClusterPolicy,
    Mode,
    Sync
  },

  mixins: [CreateEditView, FormValidation],

  props: {
    mode: {
      type:     String,
      required: true,
    },

    value: {
      type:     Object,
      required: true,
    },

    provider: {
      type:     String,
      required: true,
    },
  },

  name: 'CruK3KCluster',

  async fetch() {
    const hash = {};

    if (this.$store.getters['management/schemaFor'](CAPI.RANCHER_CLUSTER)) {
      hash.provClusters = this.$store.dispatch('management/findAll', { type: CAPI.RANCHER_CLUSTER });
    }
    if (this.$store.getters['management/schemaFor'](MANAGEMENT.CLUSTER)) {
      hash.mgmtClusters = this.$store.dispatch('management/findAll', { type: MANAGEMENT.CLUSTER });
    }

    const res = await allHash(hash);

    this.provClusters = res.provClusters;

    if (this.mode === _CREATE) {
      this.k3kCluster = await this.$store.dispatch('management/create', cloneDeep(defaultCluster));
    } else {
      const ns = this.value.metadata?.annotations?.['ui.rancher/k3k-namespace'] || '';
      const id = `${ ns }/${ this.value.metadata.name }`;
      const parentClusterId = this.value.metadata?.annotations?.['ui.rancher/parent-cluster'] || '';

      const parentProvCluster = this.provClusters.find((c) => c?.mgmt?.id === parentClusterId);

      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/k3k.io.clusters/${ id }`,
          method: 'GET',
        });

        this.k3kCluster = res || {};
        this.parentClusterId = parentProvCluster.id;
        this.parentCluster = parentProvCluster;
      } catch (e) {
        this.errors.push(e);
      }
    }

    this.k3sVersions = await this.$store.dispatch('management/request', { url: '/v1-k3s-release/releases' });
  },

  created() {
    this.registerAfterHook(this.saveRoleBindings, 'save-role-bindings');
    this.registerAfterHook(this.importCluster, 'import-cluster');
  },

  watch: {
    k3sVersionOptions(neu = []) {
      if (this.mode === _CREATE && neu.length && !this.k3kCluster.spec.version) {
        this.k3kCluster.spec.version = neu[0];
      }
    },

    'k3kCluster.spec.expose'(neu) {
      if (neu.ingress) {
        this.fvFormRuleSets.push({
          path:       'spec.tlsSANs',
          rules:      ['required'],
          rootObject: this.k3kCluster
        });
      } else {
        this.fvFormRuleSets.splice(this.fvFormRuleSets.findIndex((r) => r.path === 'spec.tlsSANs'), 1);
      }
    },

    clusterBadgeAbbreviation: {
      immediate: true,
      handler(neu) {
        if (!neu) {
          return;
        }

        if (Object.keys(neu.badge).length <= 0) {
          return;
        }

        const obj = {
          [CLUSTER_BADGE.ICON_TEXT]: neu.badge.iconText, [CLUSTER_BADGE.COLOR]: neu.badge.color, [CLUSTER_BADGE.TEXT]: neu.badge.text
        };

        this.value.metadata.annotations = {
          ...this.value.metadata.annotations,
          ...obj
        };
      }
    },

    policy: {
      handler(neu) {
        if (neu?.spec) {
          this.k3kCluster.spec.mode = neu.spec.allowedMode;
          this.k3kCluster.spec.nodeSelector = neu.spec.defaultNodeSelector || defaultCluster.spec.nodeSelector;
          this.k3kCluster.spec.sync = neu.spec.sync || defaultCluster.spec.sync;
        } else {
          this.k3kCluster.spec.mode = defaultCluster.spec.mode;
          this.k3kCluster.spec.nodeSelector = defaultCluster.spec.nodeSelector;
          this.k3kCluster.spec.sync = defaultCluster.spec.sync;
        }
      },
      deep: true
    }
  },

  data() {
    const t = this.$store.getters['i18n/t'];

    return {
      k3kInstalled:               false,
      policy:                     null,
      connectingToHost:           false,
      provClusters:               [],
      parentCluster:              {},
      k3kCluster:                 {},
      modeOptions:                [{ label: t('k3k.mode.shared'), value: 'shared' }, { label: t('k3k.mode.virtual'), value: 'virtual' }],
      k3sVersions:                [],
      fvFormRuleSets:             [
        {
          path:       'metadata.name',
          rules:      ['required']
        },
        {
          path:       'metadata.namespace',
          rootObject: this.k3kCluster,
          rules:      ['namespaceRequired']
        },
      ],
      VIEW: _VIEW
    };
  },

  computed: {
    ...mapGetters({
      t:                        'i18n/withFallback',
      clusterBadgeAbbreviation: 'customisation/getPreviewCluster',
      clusterReady:             'clusterReady'
    }),

    fvExtraRules() {
      return {
        namespaceRequired: () => {
          const ns = this.k3kCluster?.metadata?.namespace;

          return !ns ? this.t('validation.required', { key: this.t('tableHeaders.namespace') }) : null;
        }
      };
    },

    isCreate() {
      return this.mode === _CREATE;
    },

    canManageMembers() {
      return canViewClusterMembershipEditor(this.$store);
    },

    k3sVersionOptions() {
      return (this.k3sVersions?.data || []).map((d) => d.version.replace('+', '-')).reverse();
    },

    localValue: {
      get() {
        return this.value;
      },
      set(newValue) {
        this.$emit('update:value', newValue);
      }
    },
  },

  methods: {
    onMembershipUpdate(update) {
      this['membershipUpdate'] = update;
    },

    async saveRoleBindings() {
      await this.value.waitForMgmt();

      if (this.membershipUpdate.save) {
        await this.membershipUpdate.save(this.value.mgmt.id);
      }
    },

    updateName({ name }) {
      this.k3kCluster.metadata.name = name;
    },

    async findNormanCluster() {
      if (this.parentCluster) {
        return await this.parentCluster.findNormanCluster();
      }
    },

    // create the k3k cluster crd
    async createCluster() {
      const normanCluster = await this.findNormanCluster();

      const baseUrl = `/k8s/clusters/${ normanCluster?.id }/v1`;

      const k3kUrl = `${ baseUrl }/k3k.io.clusters`;

      await this.$store.dispatch('management/request', {
        url: k3kUrl, method: 'POST', data: this.k3kCluster
      });
    },

    // create import cluster command from new prov cluster
    // run a job to generate kubeconfig and run the import command on the virtual cluster
    async importCluster() {
      const clusterToken = await this.value.getOrCreateToken();

      while (!clusterToken.command) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const command = clusterToken.command.split(' ');
      const registrationUrl = command[command.length - 1];

      let _importJob = JSON.stringify(importJobTemplate).replaceAll(/K3K_NAME/g, this.value.metadata.name);

      _importJob = _importJob.replaceAll(/__url/g, registrationUrl);

      const _importConfigMap = JSON.stringify(importConfigMapTemplate).replaceAll(/K3K_NAME/g, this.value.metadata.name);

      const importJob = JSON.parse(_importJob);

      const configMap = JSON.parse(_importConfigMap);

      importJob.metadata.namespace = this.k3kCluster?.metadata?.namespace;
      configMap.metadata.namespace = this.k3kCluster?.metadata?.namespace;

      const normanCluster = await this.findNormanCluster();

      const baseUrl = `/k8s/clusters/${ normanCluster?.id }/v1`;

      const cmUrl = `${ baseUrl }/configmaps`;
      const jobUrl = `${ baseUrl }/batch.jobs`;

      try {
        await this.$store.dispatch('management/request', {
          url: cmUrl, method: 'POST', data: configMap
        });

        await this.$store.dispatch('management/request', {
          url: jobUrl, method: 'POST', data: importJob
        });
      } catch (e) {
        this.errors.push(e);
      }
    },

    async saveOverride(btnCb) {
      const cluster = await this.findNormanCluster();

      try {
        if (this.mode === _CREATE) {
          // create the k3k cluster crd
          await this.createCluster();

          // Add annotations so the ui knows the imported cluster is a virtual cluster, and which is its parent cluster
          // annotate both the mgmt id, used to make requests to the host cluster, and the prov cluster name, which is the human-readable name
          this.value.metadata = this.value.metadata || {};
          merge(this.value.metadata.annotations, defaultAnnotations);

          this.value.metadata.annotations['ui.rancher/parent-cluster'] = cluster.id;

          this.value.metadata.annotations['ui.rancher/parent-cluster-display'] = this.parentCluster.displayName || this.parentCluster.name;
          this.value.metadata.annotations['ui.rancher/k3k-namespace'] = this.k3kCluster.metadata.namespace;
        } else {
          // save existing k3kCluster
          await cluster.$dispatch('request', {
            url:    `/k8s/clusters/${ cluster?.id }/v1/k3k.io.clusters/${ this.k3kCluster.id }`,
            method: 'PUT',
            data:   this.k3kCluster
          });
        }

        // this.save is a method defined in the create edit view mixin
        // it handles errors returned when POSTing the new provisioning cluster - we need to catch them in this context as well, to clean up other resources so the user can re-try creating the virtual cluster
        const cb = (passed) => {
          if (!passed && this.mode === _CREATE) {
            this.deleteK3kCluster();
          }

          return btnCb(passed);
        };

        await this.save(cb);
      } catch (err) {
        this.errors.push(err);
        btnCb(false);
      }
    },

    async deleteK3kCluster() {
      const cluster = await this.findNormanCluster();
      const { name, namespace } = this.k3kCluster.metadata || {};

      if (name && namespace) {
        try {
          const url = `/k8s/clusters/${ cluster?.id }/v1/k3k.io.clusters/${ namespace }/${ name }`;

          await this.$store.dispatch('management/request', {
            url,
            method: 'DELETE'
          });
        } catch (e) {
          this.errors.push(e);
        }
      }
    },

    handleInstallationError(e) {
      const msg = this.t('k3k.errors.installingK3k');

      // component will emit "false" to clear errors
      if (e) {
        this.errors.push(`${ msg }: ${ e }`);
      } else {
        this.errors = this.errors.filter((err) => {
          return typeof err !== 'string' || !err.includes(msg);
        });
      }
    },

    cancel() {
      this.$router.push({
        name:   'c-cluster-product-resource',
        params: {
          cluster:  this.$route.params.cluster,
          product:  this.$store.getters['productId'],
          resource: CAPI.RANCHER_CLUSTER,
        },
      });
    },
  }
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <CruResource
    v-else
    :mode="mode"
    :resource="value"
    :errors="fvUnreportedValidationErrors"
    :validation-passed="fvFormIsValid"
    component-testid="cluster-manager-virtual-cluster"
    :cancel-event="true"
    @finish="saveOverride"
    @error="e => errors = e"
    @cancel="cancel"
  >
    <NameNsDescription
      v-if="!isView"
      v-model:value="localValue"
      :mode="mode"
      :namespaced="false"
      name-label="cluster.name.label"
      name-placeholder="cluster.name.placeholder"
      description-label="cluster.description.label"
      description-placeholder="cluster.description.placeholder"
      :create-namespace-override="true"
      :rules="{name: fvGetAndReportPathRules('metadata.name')}"
      @update:value="updateName"
    >
      <template #customize>
        <ClusterAppearance
          class="cluster-appearance col span-3"
          :name="k3kCluster.metadata.name"
          :current-cluster="value"
          :mode="mode"
        />
      </template>
    </NameNsDescription>
    <Tabbed
      :use-hash="false"
      side-tabs
    >
      <Tab
        name="virtual-cluster"
        label-key="k3k.sections.basics"
        :weight="10"
      >
        <InstallK3k
          v-model:parent-cluster="parentCluster"
          v-model:k3k-installed="k3kInstalled"
          :mode="mode"
          :clusters="provClusters"
          @error="handleInstallationError"
        />

        <ClusterPolicy
          v-model:target-namespace="k3kCluster.metadata.namespace"
          v-model:policy="policy"
          :host-cluster="parentCluster"
          :k3k-installed="k3kInstalled"
          :mode="mode"
          :rules="{namespace:fvGetAndReportPathRules('metadata.namespace')}"
        />

        <div class="row mb-20">
          <div class="col span-6">
            <LabeledSelect
              v-model:value="k3kCluster.spec.version"
              label-key="k3k.k3sVersion.label"
              :options="k3sVersionOptions"
              :mode="mode"
            />
          </div>
        </div>

        <template
          v-if="!policy"
        >
          <Mode
            v-model:k3k-mode="k3kCluster.spec.mode"
            :mode="mode"
          />
          <Sync
            v-model:sync="k3kCluster.spec.sync"
            :mode="mode"
          />
        </template>
        <Storage
          v-model:storage-class-name="k3kCluster.spec.persistence.storageClassName"
          v-model:persistence-type="k3kCluster.spec.persistence.type"
          v-model:storage-request-size="k3kCluster.spec.persistence.storageRequestSize"
          :parent-cluster="parentCluster"
          :prov-clusters="provClusters"
          :mode="mode"
        />
      </Tab>
      <Tab
        name="server-agents"
        label-key="k3k.sections.serverAndAgents"
        :weight="9"
      >
        <div class="row mb-20">
          <div class="col span-3">
            <LabeledInput
              v-model:value.number="k3kCluster.spec.servers"
              label-key="k3k.servers.number.label"
              :mode="mode"
            />
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-12">
            <KeyValue
              v-model:value="k3kCluster.spec.serverEnvs"
              key-name="name"
              :as-map="false"
              :mode="mode"
              :initial-empty-row="true"
              :read-allowed="false"
              :title="t('k3k.servers.envVars.title')"
              :add-label="t('k3k.agents.envVars.addLabel')"
            >
              <template #title>
                <h3 class="mb-0">
                  {{ t('k3k.servers.envVars.title') }}
                </h3>
              </template>
            </KeyValue>
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <ArrayList
              v-model:value="k3kCluster.spec.serverArgs"
              :mode="mode"
              :read-allowed="false"
              :title="t('k3k.servers.serverArgs.label')"
              :initial-empty-row="true"
              :add-label="t('k3k.servers.serverArgs.addLabel')"
            >
              <template #title>
                <h3>{{ t('k3k.servers.serverArgs.label') }}</h3>
              </template>
            </ArrayList>
          </div>
        </div>

        <div class="row mt-40 mb-20">
          <div class="col span-3">
            <LabeledInput
              v-model:value.number="k3kCluster.spec.agents"
              label-key="k3k.agents.number.label"
              :mode="mode"
            />
          </div>
        </div>

        <div class="row mb-20">
          <div class="col span-12">
            <KeyValue
              v-model:value="k3kCluster.spec.agentEnvs"
              key-name="name"
              :as-map="false"
              :mode="mode"
              :read-allowed="false"
              :initial-empty-row="true"
              :title="t('k3k.agents.envVars.title')"
              :add-label="t('k3k.agents.envVars.addLabel')"
            >
              <template #title>
                <h3 class="mb-0">
                  {{ t('k3k.agents.envVars.title') }}
                </h3>
              </template>
            </KeyValue>
          </div>
        </div>
        <div
          v-if="!policy"
          class="row mt-40 mb-20"
        >
          <div class="col span-12">
            <KeyValue
              v-model:value="k3kCluster.spec.nodeSelector"
              :initial-empty-row="true"
              :mode="mode"
              :read-allowed="false"
              :title="t('k3k.nodeSelector.label')"
              :add-label="t('k3k.nodeSelector.addLabel')"
            >
              <template #title>
                <h3>{{ t('k3k.nodeSelector.label') }}</h3>
                <t
                  raw
                  k="k3k.nodeSelector.tooltip"
                />
              </template>
            </KeyValue>
          </div>
        </div>
      </Tab>
      <Tab
        name="Networking"
        label-key="k3k.sections.networking"
        :weight="8"
      >
        <Networking
          v-model:cluster-c-i-d-r="k3kCluster.spec.clusterCIDR"
          v-model:service-c-i-d-r="k3kCluster.spec.serviceCIDR"
          v-model:cluster-d-n-s="k3kCluster.spec.clusterDNS"
          v-model:tls-s-a-ns="k3kCluster.spec.tlsSANs"
          v-model:expose="k3kCluster.spec.expose"
          :rules="k3kCluster.spec.expose?.ingress ? {tlsSANs: fvGetAndReportPathRules('spec.tlsSANs')} : {}"
          :mode="mode"
        />
      </Tab>
      <Tab
        v-if="canManageMembers"
        name="memberRoles"
        label-key="cluster.tabs.memberRoles"
        :weight="7"
      >
        <Banner
          v-if="isEdit"
          color="info"
        >
          {{ t('cluster.memberRoles.removeMessage') }}
        </Banner>
        <ClusterMembershipEditor
          :mode="mode"
          :parent-id="value.mgmt ? value.mgmt.id : null"
          @membership-update="onMembershipUpdate"
        />
      </Tab>
      <Tab
        name="labels"
        label-key="generic.labelsAndAnnotations"
        :weight="6"
      >
        <Labels
          v-model:value="localValue"
          :mode="mode"
        />
      </Tab>
    </Tabbed>
  </CruResource>
</template>

<style lang="scss" scoped>
  :deep(.centered) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
  }

  .cluster-appearance {
    margin-right: 1.75%
  }
</style>
