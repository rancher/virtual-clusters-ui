<script>
import { mapGetters } from 'vuex';
import cloneDeep from 'lodash/cloneDeep';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import NameNsDescription from '@shell/components/form/NameNsDescription';

import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import Labels from '@shell/components/form/Labels.vue';
import ArrayList from '@shell/components/form/ArrayList';

import KeyValue from '@shell/components/form/KeyValue.vue';
import { Banner } from '@components/Banner';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import RadioGroup from '@components/Form/Radio/RadioGroup.vue';
import ClusterAppearance from '@shell/components/form/ClusterAppearance';
import Accordion from '@components/Accordion/Accordion.vue';

import ClusterMembershipEditor, { canViewClusterMembershipEditor } from '@shell/components/form/Members/ClusterMembershipEditor';
import { CAPI, MANAGEMENT } from '@shell/config/types';
import CreateEditView from '@shell/mixins/create-edit-view';
import { _CREATE } from '@shell/config/query-params';
import { allHash } from '@shell/utils/promise';
import { saferDump } from '@shell/utils/create-yaml';

import { K3K } from '../../types';
import HostCluster from './HostCluster.vue';
import Networking from './Networking.vue';
import Storage from './Storage.vue';

import importConfigMapTemplate from '../../resources/import-configmap.json';
import importJobTemplate from '../../resources/import-job.json';

const defaultCluster = {
  type:       K3K.CLUSTER,
  apiVersion: 'k3k.io/v1alpha1',
  kind:       'Cluster',
  metadata:   { name: '' },
  spec:       {
    mode:        'shared',
    agents:      0,
    persistence: {
      storageRequestSize: '5Gi',
      type:               'dynamic',
    },
    servers: 1,
  }
};

/**
 * provisioning.cattle.io.cluster default annotations
 *
 * also set before creation:
 * 'ui.rancher/parent-cluster' - host cluster's norman cluster id
 * 'ui.rancher/parent-cluster-display' - host cluster provisioning cluster displayName model property
 * 'ui.rancher/k3k-namespace'  - namespace/id of the k3k cluster in the host cluster
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
    RadioGroup,
    KeyValue,
    ClusterAppearance,
    HostCluster,
    Accordion,
    Networking,
    Storage,
    ArrayList
  },

  mixins: [CreateEditView],

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
      const ns = this.value.metadata.annotations['ui.rancher/k3k-namespace'] || '';
      const id = ns.split('k3k-')[0];
      const parentClusterId = this.value.metadata.annotations['ui.rancher/parent-cluster'] || '';

      const parentProvCluster = this.provClusters.find((c) => c?.mgmt?.id === parentClusterId);

      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/k3k.io.clusters/${ ns }/${ id }`,
          method: 'GET',
        });

        this.k3kCluster = res.data[0] || {};
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
  },

  watch: {
    k3sVersionOptions(neu = []) {
      if (this.mode === _CREATE && neu.length && !this.k3kCluster.spec.version) {
        this.k3kCluster.spec.version = neu[0];
      }
    }
  },

  data() {
    const t = this.$store.getters['i18n/t'];

    return {
      provClusters:        [],
      parentCluster:       {},
      k3kCluster:          {},
      modeOptions:         [{ label: t('k3k.mode.shared'), value: 'shared' }, { label: t('k3k.mode.virtual'), value: 'virtual' }],
      k3sVersions:         []
    };
  },

  computed: {
    ...mapGetters({ t: 'i18n/withFallback' }),

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
      this.k3kCluster.metadata.namespace = `k3k-${ name }`;
    },

    async findNormanCluster() {
      if (this.parentCluster) {
        return await this.parentCluster.findNormanCluster();
      }
    },

    // create the k3k cluster crd
    async createCluster() {
      const normanCluster = await this.findNormanCluster();

      const ns = {
        apiVersion: 'v1',
        kind:       'Namespace',
        metadata:
          { name: this.k3kCluster.metadata.namespace }
      };

      const nsyaml = saferDump(ns);

      await normanCluster.doAction('importYaml', { yaml: nsyaml });

      delete this.k3kCluster.type;
      const apply = saferDump(this.k3kCluster);

      await normanCluster.doAction('importYaml', { yaml: apply });

      return normanCluster.id;
    },

    // create import cluster command from new prov cluster
    // run a job to generate kubeconfig and run the import command on the virtual cluster
    async importCluster(clusterId) {
      const clusterToken = await this.value.getOrCreateToken();

      while (!clusterToken.command) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const command = clusterToken.command.split(' ');
      const registrationUrl = command[command.length - 1];

      let importJob = JSON.stringify(importJobTemplate).replaceAll(/K3K_NAMESPACE/g, this.value.metadata.name);

      importJob = importJob.replaceAll(/__url/g, registrationUrl);

      const importConfigMap = JSON.stringify(importConfigMapTemplate).replaceAll(/K3K_NAMESPACE/g, this.value.metadata.name);

      const importJobYaml = saferDump(JSON.parse(importJob));

      const configMapYaml = saferDump(JSON.parse(importConfigMap));

      const applyCm = {
        defaultNamespace: this.value.metadata.name,
        yaml:             configMapYaml
      };

      const applyJob = {
        defaultNamespace: this.value.metadata.name,
        yaml:             importJobYaml
      };

      await this.$store.dispatch('management/request', {
        url:    `/v1/management.cattle.io.clusters/${ clusterId }?action=apply`,
        method: 'POST',
        data:   applyCm
      });

      await this.$store.dispatch('management/request', {
        url:    `/v1/management.cattle.io.clusters/${ clusterId }?action=apply`,
        method: 'POST',
        data:   applyJob
      });
    },

    async saveOverride(btnCb) {
      try {
        if (this.mode === _CREATE) {
          // create the k3k cluster crd and return the id of the host cluster's mgmt cluster
          // mgmt cluster is needed to make requests against its steve api
          // prov cluster is needed to generate a human-readable host cluster name
          const clusterId = await this.createCluster();

          // Add annotations so the ui knows the imported cluster is a virtual cluster, and which is its parent cluster
          this.value.metadata = this.value.metadata || {};
          this.value.metadata.annotations = { ...defaultAnnotations };

          this.value.metadata.annotations['ui.rancher/parent-cluster'] = clusterId;

          this.value.metadata.annotations['ui.rancher/parent-cluster-display'] = this.parentCluster.displayName || this.parentCluster.name;
          this.value.metadata.annotations['ui.rancher/k3k-namespace'] = `k3k-${ this.value.metadata.name }`;

          // get import cluster command
          this.importCluster(clusterId);
        } else {
          // save existing k3kCluster
          const cluster = await this.findNormanCluster();

          await cluster.$dispatch('request', {
            url:    `/k8s/clusters/${ cluster.id }/v1/k3k.io.clusters/${ this.value.metadata.namescape }/${ this.value.metadata.name }`,
            method: 'PUT',
            data:   this.k3kCluster
          });
        }
        // save prov cluster
        await this.save(btnCb);
      } catch (err) {
        this.errors.push(err);
        btnCb(false);
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
    :errors="errors"
    component-testid="cluster-manager-virtual-cluster"
    :cancel-event="true"
    @finish="saveOverride"
    @error="e => errors = e"
    @cancel="cancel"
  >
    {{ {...k3kCluster} }}
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

    <Accordion
      name="virtual-cluster"
      title-key="k3k.sections.basics"
      class="accordion"
      open-initially
    >
      <HostCluster
        v-model:parent-cluster="parentCluster"
        :mode="mode"
        :clusters="provClusters"
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

      <div class="row mb-20">
        <div class="col span-6">
          <RadioGroup
            v-model:value="k3kCluster.spec.mode"
            name="k3k-cluster-mode"
            :row="true"
            :mode="mode"
            label-key="k3k.mode.label"
            :options="[{label: t('k3k.mode.shared'), value: 'shared'},{label: t('k3k.mode.virtual'), value: 'virtual'} ]"
          >
            <template #label>
              <h4>{{ t('k3k.mode.label') }}</h4>
            </template>
          </RadioGroup>
        </div>
        <div class="col span-6">
          <span class="text-label">{{ t('k3k.mode.tooltip') }}</span>
        </div>
      </div>
      <Storage
        v-model:storage-class-name="k3kCluster.spec.persistence.storageClassName"
        v-model:persistence-type="k3kCluster.spec.persistence.type"
        v-model:storage-request-size="k3kCluster.spec.persistence.storageRequestSize"
        :parent-cluster="parentCluster"
        :prov-clusters="provClusters"
        :mode="mode"
      />
    </Accordion>
    <Accordion
      title-key="k3k.sections.serverAndAgents"
      class="accordion"
      open-initially
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
            :as-map="false"
            :mode="mode"
            :initial-empty-row="true"
            :read-allowed="false"
            :title="t('k3k.servers.envVars.title')"
            :add-label="t('k3k.agents.envVars.addLabel')"
          >
            <template #title>
              <h4 class="mb-0">
                {{ t('k3k.servers.envVars.title') }}
              </h4>
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
              <h4>{{ t('k3k.servers.serverArgs.label') }}</h4>
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
            :as-map="false"
            :mode="mode"
            :read-allowed="false"
            :initial-empty-row="true"
            :title="t('k3k.agents.envVars.title')"
            :add-label="t('k3k.agents.envVars.addLabel')"
          >
            <template #title>
              <h4 class="mb-0">
                {{ t('k3k.agents.envVars.title') }}
              </h4>
            </template>
          </KeyValue>
        </div>
      </div>
      <div class="row mt-40 mb-20">
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
              <h4>{{ t('k3k.nodeSelector.label') }}</h4>
              <span class="text-label">{{ t('k3k.nodeSelector.tooltip') }}</span>
            </template>
          </KeyValue>
        </div>
      </div>
    </Accordion>
    <Accordion
      title-key="k3k.sections.networking"
      class="accordion"
      open-initially
    >
      <Networking
        v-model:cluster-c-i-d-r="k3kCluster.spec.clusterCIDR"
        v-model:service-c-i-d-r="k3kCluster.spec.serviceCIDR"
        v-model:cluster-d-n-s="k3kCluster.spec.clusterDNS"
        v-model:tls-s-a-ns="k3kCluster.spec.tlsSANs"
        v-model:expose="k3kCluster.spec.expose"
        :mode="mode"
      />
    </Accordion>
    <Accordion
      v-if="canManageMembers"
      name="memberRoles"
      title-key="cluster.tabs.memberRoles"
      class="accordion"
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
    </Accordion>
    <Accordion
      class="accordion"
      title-key="generic.labelsAndAnnotations"
    >
      <Labels
        v-model:value="localValue"
        :mode="mode"
      />
    </Accordion>
  </CruResource>
</template>

<style lang="scss" scoped>
  :deep(.centered) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
  }

  .accordion {
    margin-bottom: 20px;
    border-radius: 5px;
  }

  .cluster-appearance {
    margin-right: 1.75%
  }
</style>
