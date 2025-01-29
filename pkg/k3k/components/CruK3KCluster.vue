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

import CreateEditView from '@shell/mixins/create-edit-view';

import ClusterMembershipEditor, { canViewClusterMembershipEditor } from '@shell/components/form/Members/ClusterMembershipEditor';
import { CAPI } from '@shell/config/types';
import { K3K } from '../types';
import { LabeledInput, RadioGroup } from '@rancher/components';

const defaultCluster = {
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
    tlsSANs:    ['127.0.0.1'],
    // tokenSecretRef: {
    //   name: '',
    //   namespace: ''
    // },
    version:    'v1.26.1-k3s1',
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
    if (this.$store.getters['management/schemaFor'](CAPI.RANCHER_CLUSTER)) {
      this.provClusters = await this.$store.dispatch('management/findAll', { type: CAPI.RANCHER_CLUSTER });
    }

    this.k3kCluster = await this.$store.dispatch('management/create', {
      type: K3K.CLUSTER,
      ...defaultCluster
    });

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

  watch: {
    parentClusterOptions(neu) {
      if (!this.parentCluster && neu.length) {
        this.parentCluster = neu[0].value;
      }
    },
  },

  computed: {
    ...mapGetters({ t: 'i18n/withFallback' }),

    canManageMembers() {
      return canViewClusterMembershipEditor(this.$store);
    },

    parentClusterOptions() {
      return this.provClusters.reduce((opts, cluster) => {
        if (!cluster?.metadata?.annotations?.['ui.rancher/parent-cluster']) {
          opts.push({ label: cluster.name, value: cluster.id });
        }

        return opts;
      }, []);
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

    // create the k3k cluster crd
    async createCluster() {
      const cluster = this.provClusters.find((c) => c.id === this.parentCluster);

      const normanCluster = await cluster.findNormanCluster();

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

    // create the prov cluster crd, get import command
    async saveOverride(btnCb) {
      const clusterId = await this.createCluster();

      // Create the imported cluster

      // Add annotations
      this.value.metadata = this.value.metadata || {};
      this.value.metadata.annotations = this.value.metadata.annotations || {};

      this.value.metadata.annotations['ui.rancher/provider'] = 'k3k';
      this.value.metadata.annotations['ui.rancher/parent-cluster'] = clusterId;
      this.value.metadata.annotations['ui.rancher/k3k-namespace'] = `k3k-${ this.value.metadata.name }`;

      await this.save(btnCb);

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
    />

    <Tabbed
      :side-tabs="true"
      default-tab="virtual-cluster"
    >
      <Tab
        name="virtual-cluster"
        label-key="k3k.tabs.basics"
        :weight="5"
      >
        <div class="row mb-20">
          <div class="col span-6">
            <LabeledSelect
              v-model:value="parentCluster"
              label-key="k3k.hostCluster.label"
              :options="parentClusterOptions"
              :mode="mode"
            />
          </div>
        </div>

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

              :mode="mode"
              label-key="k3k.mode.label"
              :options="[{label: t('k3k.mode.shared'), value: 'shared'},{label: t('k3k.mode.virtual'), value: 'virtual'} ]"
            >
              <template #label>
                <h4>{{ t('k3k.mode.label') }}</h4>
              </template>
            </RadioGroup>
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
              v-model:value="k3kCluster.spec.agents"
              label-key="k3k.agents.label"
              :mode="mode"
            />
          </div>
        </div>

        <div class="row mb-20">
          <div class="col span-12">
            <KeyValue
              v-model:value="k3kCluster.spec.nodeSelector"

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
