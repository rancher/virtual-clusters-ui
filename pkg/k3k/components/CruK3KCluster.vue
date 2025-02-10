<script>
import { mapGetters } from 'vuex';

import LabeledSelect from '@shell/components/form/LabeledSelect';
import NameNsDescription from '@shell/components/form/NameNsDescription';
import Tabbed from '@shell/components/Tabbed';
import Tab from '@shell/components/Tabbed/Tab';
import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import Labels from '@shell/edit/provisioning.cattle.io.cluster/Labels';
import KeyValue from '@shell/components/form/KeyValue.vue';
import ArrayList from '@shell/components/form/ArrayList';

import { Banner } from '@components/Banner';
import { saferDump } from '@shell/utils/create-yaml';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import RadioGroup from '@components/Form/Radio/RadioGroup.vue';

import CreateEditView from '@shell/mixins/create-edit-view';

import ClusterMembershipEditor, { canViewClusterMembershipEditor } from '@shell/components/form/Members/ClusterMembershipEditor';
import { CAPI } from '@shell/config/types';
import { K3K } from '../types';
import ClusterAppearance from '@shell/components/form/ClusterAppearance';
import HostCluster from './HostCluster.vue';
import { _CREATE, _CLONE } from '@shell/config/query-params';
import cloneDeep from 'lodash/cloneDeep';

const defaultCluster = {
  type:       K3K.CLUSTER,
  apiVersion: 'k3k.io/v1alpha1',
  kind:       'Cluster',
  metadata:   { name: '' },
  spec:       {
    mode:        'virtual',
    agents:      0,
    expose:      { nodePort: { enabled: true } },
    persistence: {
      storageRequestSize: '1G', type: 'dynamic', storageClassName: 'local-path'
    },
    servers:    1,
    // tlsSANs:    ['127.0.0.1'],
    version:    'v1.31.4-k3s1',
    serverArgs: ['--write-kubeconfig-mode=0644']
  }
};

export default {
  emites: ['update:value'],

  components: {
    LabeledSelect,
    NameNsDescription,
    Tabbed,
    Tab,
    CruResource,
    Loading,
    Labels,
    ClusterMembershipEditor,
    Banner,
    LabeledInput,
    RadioGroup,
    KeyValue,
    ArrayList,
    ClusterAppearance,
    HostCluster
  },

  mixins: [CreateEditView],

  props: {
    mode: {
      type:     String,
      required: true,
    },

    realMode: {
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
    if (this.$store.getters['management/schemaFor'](CAPI.RANCHER_CLUSTER)) {
      this.provClusters = await this.$store.dispatch('management/findAll', { type: CAPI.RANCHER_CLUSTER });
    }

    if (this.mode === _CREATE) {
      this.k3kCluster = await this.$store.dispatch('management/create', cloneDeep(defaultCluster));
    } else {
      const ns = this.value.metadata.annotations['ui.rancher/k3k-namespace'] || '';
      const id = ns.split('k3k-')[0];
      const clusterId = this.value.metadata.annotations['ui.rancher/parent-cluster'] || '';

      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ clusterId }/v1/k3k.io.clusters/${ ns }/${ id }`,
          method: 'GET',
        });

        this.k3kCluster = res.data[0] || {};
        this.parentCluster = this.value.metadata.annotations['ui.rancher/parent-cluster-display'];
      } catch (e) {
        console.error(e);
      }

      // TODO nb properly clean for clone
      if (this.mode === _CLONE) {
        this.k3kCluster.name = '';
        this.value.metadata.name = '';
      }
    }

    this.k3sVersions = await this.$store.dispatch('management/request', { url: '/v1-k3s-release/releases' });
  },

  created() {
    this.registerAfterHook(this.saveRoleBindings, 'save-role-bindings');
  },

  data() {
    const t = this.$store.getters['i18n/t'];

    return {
      provClusters:  [],
      parentCluster: '',
      k3kCluster:    {},
      modeOptions:   [{ label: t('k3k.mode.shared'), value: 'shared' }, { label: t('k3k.mode.virtual'), value: 'virtual' }],
      k3sVersions:   []
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
    }

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
      const cluster = this.provClusters.find((c) => c.id === this.parentCluster);

      return await cluster.findNormanCluster();
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

      const importJobYaml = require('../resources/import-job.yaml.md').body;

      if (!importJobYaml) {
        console.error('Could not load import template');

        const a = require('../resources/import-job.yaml.md');

        console.log(a);

        return;
      }

      let templateYaml = importJobYaml.replaceAll(/K3K_NAMESPACE/g, this.value.metadata.name);

      templateYaml = templateYaml.replaceAll(/__url/g, registrationUrl);

      const apply = {
        defaultNamespace: this.value.metadata.name,
        yaml:             templateYaml
      };

      await this.$store.dispatch('management/request', {
        url:    `/v1/management.cattle.io.clusters/${ clusterId }?action=apply`,
        method: 'POST',
        data:   apply
      });
    },

    async saveOverride(btnCb) {
      if (this.mode === _CREATE) {
        // create the k3k cluster crd and return the norman cluster id of host cluster
        const clusterId = await this.createCluster();
        const parentProvCluster = this.provClusters.find((c) => c.id === this.parentCluster);

        // Add annotations
        this.value.metadata = this.value.metadata || {};
        this.value.metadata.annotations = this.value.metadata.annotations || {};

        this.value.metadata.annotations['ui.rancher/provider'] = 'k3k';
        this.value.metadata.annotations['ui.rancher/parent-cluster'] = clusterId;
        this.value.metadata.annotations['ui.rancher/parent-cluster-display'] = parentProvCluster.displayName || parentProvCluster.name;
        this.value.metadata.annotations['ui.rancher/k3k-namespace'] = `k3k-${ this.value.metadata.name }`;

        // get import cluster command
        this.importCluster(clusterId);
      } else {
        // save existing k3kCluster
        const cluster = await this.findNormanCluster();

        // TODO nb edit
        await cluster.$dispatch('request', {
          url:    `/k8s/clusters/${ cluster.id }/v1/k3k.io.clusters/${ this.value.metadata.namescape }/${ this.value.metadata.name }`,
          method: 'PUT',
          data:   this.k3kCluster
        });
      }

      // save prov cluster
      await this.save(btnCb);
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
    @finish="saveOverride"
    @error="e => errors = e"
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
      @update:value="updateName"
    >
      <template #customize>
        <ClusterAppearance
          :name="k3kCluster.metadata.name"
          :current-cluster="value"
          :mode="mode"
        />
      </template>
    </NameNsDescription>

    <Tabbed
      :side-tabs="true"
      default-tab="virtual-cluster"
    >
      <Tab
        name="virtual-cluster"
        label-key="k3k.tabs.basics"
        :weight="5"
      >
        <HostCluster
          v-model:parent-cluster="parentCluster"
          :norman-cluster="normanCluster"
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
            <span class="text-muted">{{ t('k3k.mode.tooltip') }}</span>
          </div>
        </div>

        <h4>{{ t('k3k.servers.title') }}</h4>
        <div class="row mb-20">
          <div class="col span-3">
            <LabeledInput
              v-model:value="k3kCluster.spec.servers"
              label-key="k3k.servers.label"
              :mode="mode"
            />
          </div>
          <div class="col span-3">
            <LabeledInput
              v-model:value.number="k3kCluster.spec.agents"
              label-key="k3k.agents.label"
              :mode="mode"
            />
          </div>
        </div>

        <div class="row mb-20">
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
                <span class="text-muted">{{ t('k3k.nodeSelector.tooltip') }}</span>
              </template>
            </KeyValue>
          </div>
        </div>
      </Tab>
      <Tab
        name="networking"
        label-key="k3k.tabs.networking"
        :weight="4"
      >
        <div class="row mb-20">
          <div class="col span-6">
            <LabeledInput
              v-model:value="k3kCluster.spec.clusterCIDR"
              label-key="k3k.clusterCIDR.label"
              placeholder-key="k3k.clusterCIDR.placeholder"
              :mode="mode"
            />
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <LabeledInput
              v-model:value="k3kCluster.spec.serviceCIDR"
              label-key="k3k.serviceCIDR.label"
              placeholder-key="k3k.serviceCIDR.placeholder"
              :mode="mode"
            />
          </div>
          <div class="col span-6 centered">
            <t
              k="k3k.serviceCIDR.tooltip"
              class="text-label"
            />
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <LabeledInput
              v-model:value="k3kCluster.spec.clusterDNS"
              label-key="k3k.clusterDNS.label"
              placeholder-key="k3k.clusterDNS.placeholder"
              :mode="mode"
            />
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <ArrayList
              v-model:value="k3kCluster.spec.tlsSANs"
              :protip="false"
              :mode="mode"
              :title="t('k3k.tlsSANs.label')"
            />
          </div>
        </div>
      </Tab>
      <Tab
        v-if="canManageMembers"
        name="memberRoles"
        label-key="cluster.tabs.memberRoles"
        :weight="3"
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
      <Labels
        v-model:value="localValue"
        :mode="mode"
      />
    </Tabbed>
  </CruResource>
</template>

<style lang="scss" scoped>
  .centered {
    display: flex;
    align-items: center;
  }
</style>
