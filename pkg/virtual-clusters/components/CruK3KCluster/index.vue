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
import { RcSection } from '@components/RcSection';
import { RcCounterBadge } from '@components/Pill';

import ClusterMembershipEditor, { canViewClusterMembershipEditor } from '@shell/components/form/Members/ClusterMembershipEditor';
import { CAPI, MANAGEMENT, NAMESPACE } from '@shell/config/types';
import { SETTING } from '@shell/config/settings';
import CreateEditView from '@shell/mixins/create-edit-view';
import FormValidation from '@shell/mixins/form-validation';
import { _CREATE, _VIEW } from '@shell/config/query-params';
import { allHash } from '@shell/utils/promise';
import { CLUSTER_BADGE } from '@shell/config/labels-annotations';

import { K3K } from '../../types';
import { PROVIDER, PARENT_CLUSTER, PARENT_CLUSTER_DISPLAY, K3K_NAMESPACE } from '../../labels-annotations';
import InstallK3k from '../InstallK3k.vue';
import Networking from './Networking.vue';
import Storage from './Storage.vue';
import ClusterPolicy from './ClusterPolicy.vue';
import SecretMounts from './SecretMounts/index.vue';
import Mode from '../Mode.vue';
import Sync, { SYNC_CONTEXT } from '../Sync';
import NotAllowed from '../Sync/NotAllowed.vue';
import PolicyAffinity from '../../edit/k3k.io.virtualclusterpolicy/PolicyAffinity.vue';
import K3kVersionBanner from '../K3kVersionBanner.vue';

import { MODES } from '../../utils/shared';
import { fieldIsSupported } from '../../utils/k3kInstalled';

import importConfigMapTemplate from '../../resources/import-configmap.json';
import importJobTemplate from '../../resources/import-job.json';
import merge from 'lodash/merge';
import { set } from '@shell/utils/object';

// Pinned fallback for the cluster import job image; used when the
// 'shell-image' setting is empty. Kept in sync with the rancher/shell
// version shipped with the minimum supported Rancher release.
const DEFAULT_IMPORT_JOB_IMAGE = 'rancher/shell:v0.7.0';

// Returns true if the first segment of an image reference is a registry
// host (contains '.' or ':', or is 'localhost'), mirroring containerd's
// reference parsing.
function imageHasRegistry(image) {
  const firstSegment = image.split('/')[0];

  return firstSegment.includes('.') || firstSegment.includes(':') || firstSegment === 'localhost';
}

const defaultCluster = {
  type:       K3K.CLUSTER,
  apiVersion: 'k3k.io/v1beta1',
  kind:       'Cluster',
  metadata:   {
    name:      '',
    namespace: ''
  },
  spec: {
    mode:        MODES.SHARED,
    agents:      0,
    persistence: {
      storageRequestSize: '5Gi',
      type:               'dynamic',
    },
    servers:      1,
    nodeSelector: {},
    sync:         {
      storageClasses:
       { enabled: true }
    },
    secretMounts: [{
      secretName: '',
      mountPath:  '',
      role:       'all'
    }]
  }
};
  // map of fields in k3kCluster that are superceded by policy configuration, in the format k3kCluster key: policy key
const POLICY_OVERRIDES = {
  mode:           'allowedMode',
  nodeSelector:   'defaultNodeSelector',
  sync:           'sync',
  agentAffinity:  'defaultAgentAffinity',
  serverAffinity: 'defaultServerAffinity'
};

/**
 * provisioning.cattle.io.cluster default annotations
 *
 * also set before creation:
 * PARENT_CLUSTER - host cluster's norman cluster id
 * PARENT_CLUSTER_DISPLAY - host cluster provisioning cluster displayName model property
 * K3K_NAMESPACE - namespace of the k3k cluster in the host cluster
 */
const defaultAnnotations = {
  // prevent k3s-upgrade-controller from running: this will be managed by k3k
  'rancher.io/imported-cluster-version-management': 'false',
  // display machine provider in cluster mgmt list
  [PROVIDER]:                                       'k3k'
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
    Sync,
    PolicyAffinity,
    K3kVersionBanner,
    SecretMounts,
    RcSection,
    RcCounterBadge,
    NotAllowed
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
      const ns = this.value.metadata?.annotations?.[K3K_NAMESPACE] || '';
      const id = `${ ns }/${ this.value.metadata.name }`;
      const parentClusterId = this.value.metadata?.annotations?.[PARENT_CLUSTER] || '';

      const parentProvCluster = this.provClusters.find((c) => c?.mgmt?.id === parentClusterId);

      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ parentClusterId }/v1/k3k.io.clusters/${ id }`,
          method: 'GET',
        });

        this.k3kCluster = res || {};
        this.parentClusterId = parentProvCluster.id;
        this.parentCluster = parentProvCluster;
        // on edit, the parent display name annotation is used as a display-only fallback if the user currently loading the form can't view the parent prov cluster obeject
        this.parentClusterDisplayAnnotation = this.value.metadata.annotations[PARENT_CLUSTER_DISPLAY];
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
          [CLUSTER_BADGE.ICON_TEXT]: neu.badge.iconText,
          [CLUSTER_BADGE.COLOR]:     neu.badge.color,
          [CLUSTER_BADGE.TEXT]:      neu.badge.text
        };

        this.value.metadata.annotations = {
          ...this.value.metadata.annotations,
          ...obj
        };
      }
    },

    /**
   * When users select a policy the k3k cluster spec is updated to match it
   * if a particular field is undefined in the new policy the k3k cluster is updated to match defaultCluster
   */
    policy: {
      handler(neu) {
        const applyPolicyOverrides = (policySpec = {}) => {
          for (const [clusterKey, policyKey] of Object.entries(POLICY_OVERRIDES)) {
            const policyValue = policySpec[policyKey];
            const fallbackValue = defaultCluster.spec[clusterKey];

            this.k3kCluster.spec[clusterKey] = policyValue !== undefined ? cloneDeep(policyValue) : cloneDeep(fallbackValue);
          }
        };

        applyPolicyOverrides(neu?.spec);
      },
      deep: true
    },

    async parentCluster(neu) {
      const mgmtId = neu?.mgmt?.id;

      if (!mgmtId) {
        this.supportsTopology = false;

        return;
      }

      try {
        this.supportsTopology = await fieldIsSupported(this.$store, mgmtId, K3K.CLUSTER, 'spec.serverAffinity');
      } catch {
        this.supportsTopology = false;
      }
    },

    supportsTopology(neu) {
      if (!neu && this.k3kCluster?.spec) {
        delete this.k3kCluster.spec.agentAffinity;
        delete this.k3kCluster.spec.serverAffinity;
      }
    }
  },

  data() {
    const t = this.$store.getters['i18n/t'];

    return {
      SYNC_CONTEXT,
      k3kInstalled:                   false,
      policy:                         null,
      connectingToHost:               false,
      provClusters:                   [],
      parentCluster:                  {}, // provisioning cluster representing the "host cluster"
      parentClusterDisplayAnnotation: '',
      k3kCluster:                     {},
      modeOptions:                    [{
        label: t('k3k.mode.shared'),
        value: MODES.SHARED
      }, {
        label: t('k3k.mode.virtual'),
        value: MODES.VIRTUAL
      }],
      k3sVersions:      [],
      supportsTopology: false, // k3k < 1.1.0 does not support fields configured in the 'Topology' tab
      fvFormRuleSets:   [
        {
          path:  'metadata.name',
          rules: ['required']
        },
        {
          path:       'metadata.namespace',
          rootObject: this.k3kCluster,
          rules:      ['namespaceRequired']
        },
        {
          path:           'policyForValidation',
          rootObject:     this,
          rules:          ['required'],
          translationKey: 'k3k.policy.label'
        },
        {
          path:           'parentCluster.id',
          rootObject:     this,
          rules:          ['required'],
          translationKey: 'k3k.hostCluster.label'
        },
      ],
      /**
       * store k3kCluster and provisioning cluster configuration immediately before saving/importing the cluster
       * if saving/importing goes wrong, we want to be able to delete the clusters and let the user try again
       * the objects will be altered by saving the first time (eg annotations added)
       * so we need to track their pre-save state to offer a proper do-over
       */
      provClusterBeforeSave: null,
      k3kClusterBeforeSave:  null,
      VIEW:                  _VIEW,
      defaultVersionLabel:   this.t('k3k.k3sVersion.default')
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
        namespaceRequired: (ns) => {
          return !ns ? this.t('validation.required', { key: this.t('tableHeaders.namespace') }) : null;
        }
      };
    },

    policyForValidation() {
      return this.policy === null ? '' : this.policy;
    },

    isCreate() {
      return this.mode === _CREATE;
    },

    canManageMembers() {
      return canViewClusterMembershipEditor(this.$store);
    },

    k3sVersionOptions() {
      const out = (this.k3sVersions?.data || []).map((d) => d.version.replace('+', '-')).reverse();

      out.unshift(this.defaultVersionLabel);

      return out;
    },

    localValue: {
      get() {
        return this.value;
      },
      set(newValue) {
        this.$emit('update:value', newValue);
      }
    },

    isSharedMode() {
      return this.k3kCluster?.spec?.mode === MODES.SHARED;
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

    updateVersion(e) {
      if (e && e !== this.defaultVersionLabel) {
        this.k3kCluster.spec.version = e;
      } else {
        delete this.k3kCluster.spec.version;
      }
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

      const res = await this.$store.dispatch('management/request', {
        url:    k3kUrl,
        method: 'POST',
        data:   this.k3kCluster
      });

      for (const key in res) {
        if (!key.startsWith('_')) {
          set(this.k3kCluster, key, res[key]);
        }
      }
    },

    // resolve the image used by the import job: honor the 'shell-image'
    // setting if configured, otherwise fall back to a pinned default, and
    // prefix with 'system-default-registry' so air-gapped installs pull
    // from their private registry (same behavior as Rancher's own shell pods)
    async importJobImage() {
      let image = DEFAULT_IMPORT_JOB_IMAGE;

      try {
        const shellImage = await this.$store.dispatch('management/find', {
          type: MANAGEMENT.SETTING,
          id:   'shell-image'
        });

        if (shellImage?.value) {
          image = shellImage.value;
        }
      } catch {}

      if (!imageHasRegistry(image)) {
        try {
          const registrySetting = await this.$store.dispatch('management/find', {
            type: MANAGEMENT.SETTING,
            id:   SETTING.SYSTEM_DEFAULT_REGISTRY
          });
          const registry = registrySetting?.value;

          if (registry) {
            image = `${ registry }/${ image }`;
          }
        } catch {}
      }

      return image;
    },

    // create import cluster command from new prov cluster
    // run a job to generate kubeconfig and run the import command on the virtual cluster
    async importCluster() {
      let clusterToken;

      try {
        clusterToken = await this.value.getOrCreateToken();
        let attempts = 0;
        const maxAttempts = 240; // 60-second wait before timing out

        while (!clusterToken.command && attempts < maxAttempts) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (!clusterToken.command) {
          throw new Error(this.t('k3k.errors.gettingToken'));
        }
      } catch (e) {
        throw new Error(`${ this.t('k3k.errors.creatingAndRegisteringCluster') } ${ e?.message || e }`, { cause: e });
      }

      const command = clusterToken.command.split(' ');
      const registrationUrl = command[command.length - 1];

      let _importJob = JSON.stringify(importJobTemplate).replaceAll(/K3K_NAME/g, this.value.metadata.name);

      _importJob = _importJob.replaceAll(/__url/g, registrationUrl);
      _importJob = _importJob.replaceAll(/__shell_image/g, await this.importJobImage());

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
          url:    cmUrl,
          method: 'POST',
          data:   configMap
        });

        await this.$store.dispatch('management/request', {
          url:    jobUrl,
          method: 'POST',
          data:   importJob
        });
      } catch (e) {
        this.errors.push(e);
      }
    },

    async saveOverride(btnCb) {
      // Remove empty secret mounts before saving
      if (this.k3kCluster.spec.secretMounts) {
        this.k3kCluster.spec.secretMounts = this.k3kCluster.spec.secretMounts.filter((m) => m.secretName || m.mountPath);
        if (!this.k3kCluster.spec.secretMounts.length) {
          delete this.k3kCluster.spec.secretMounts;
        }
      }

      this.provClusterBeforeSave = cloneDeep(this.value);
      this.k3kClusterBeforeSave = cloneDeep(this.k3kCluster);

      const cluster = await this.findNormanCluster();
      let createdNamespace = false;

      try {
        if (this.mode === _CREATE) {
          // create the target namespace first
          createdNamespace = await this.$refs.clusterPolicy.createNamespaceIfNeeded();

          // create the k3k cluster crd
          await this.createCluster();

          // Add annotations so the ui knows the imported cluster is a virtual cluster, and which is its parent cluster
          // annotate both the mgmt id, used to make requests to the host cluster, and the prov cluster name, which is the human-readable name
          this.value.metadata = this.value.metadata || {};
          merge(this.value.metadata.annotations, defaultAnnotations);

          this.value.metadata.annotations[PARENT_CLUSTER] = cluster.id;

          this.value.metadata.annotations[PARENT_CLUSTER_DISPLAY] = this.parentCluster.displayName || this.parentCluster.name;
          this.value.metadata.annotations[K3K_NAMESPACE] = this.k3kCluster.metadata.namespace;
        } else {
          // save existing k3kCluster
          await cluster.$dispatch('request', {
            url:    `/k8s/clusters/${ cluster?.id }/v1/k3k.io.clusters/${ this.k3kCluster.id }`,
            method: 'PUT',
            data:   this.k3kCluster
          });
        }

        // this.save is a method defined in the create edit view mixin
        // it handles errors returned when POSTing the new provisioning cluster
        // we need to catch them in this context as well, to clean up other resources so the user can re-try creating the virtual cluster
        const cb = async(passed) => {
          if (!passed && this.mode === _CREATE) {
            try {
              await this.deleteResourcesForRedo(createdNamespace);
            } catch (e) {
              this.errors.push(e);

              return btnCb(false);
            }
          }

          return btnCb(passed);
        };

        await this.save(cb);
      } catch (err) {
        this.errors.push(err);
        btnCb(false);
      }
    },

    // if created, delete the k3k cluster, provisioning cluster and (if we created one)
    // the target namespace, and reset this.k3kCluster and this.localValue (prov cluster)
    // so that the user can retry clicking save
    // only used during create, never edit
    async deleteResourcesForRedo(createdNamespace) {
      const errors = [];

      // capture this before deleteK3kCluster() potentially resets k3kCluster
      // back to its pre-save (blank) state
      const namespaceToClean = createdNamespace ? this.k3kCluster?.metadata?.namespace : null;

      try {
        await this.deleteK3kCluster();
      } catch (e) {
        errors.push(e);
      }

      try {
        await this.deleteProvCluster();
      } catch (e) {
        errors.push(e);
      }

      if (namespaceToClean) {
        try {
          await this.deleteNamespace(namespaceToClean);
        } catch (e) {
          errors.push(e);
        }
      }

      // If any errors occurred, throw them
      if (errors.length > 0) {
        if (errors.length === 1) {
          throw errors[0];
        }
        throw new Error(errors.map((e) => e?.message || String(e)).join('\n'));
      }
    },

    async deleteK3kCluster() {
      try {
        if (this.k3kCluster?.id) {
          const revertedK3kCluster = await this.$store.dispatch('management/clone', { resource: this.k3kClusterBeforeSave });

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
            this.k3kCluster = revertedK3kCluster;
          }
        }
      } catch (e) {
        // warn users the k3k cluster might still exist
        throw new Error(`${ this.t('k3k.errors.deletingK3kCluster') }\n${ e?.message || e }`, { cause: e });
      }
    },

    async deleteProvCluster() {
      try {
        if (this.value?.id) {
          const revertedProvCluster = await this.$store.dispatch('management/clone', { resource: this.provClusterBeforeSave });

          await this.value.remove();
          this.localValue = revertedProvCluster;
        }
      } catch (e) {
        // warn users the prov cluster might still exist
        throw new Error(`${ this.t('k3k.errors.deletingProvCluster') }\n${ e?.message || e }`, { cause: e });
      }
    },

    // best-effort rollback for a namespace ClusterPolicy created via createNamespaceIfNeeded
    async deleteNamespace(name) {
      try {
        const cluster = await this.findNormanCluster();

        await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ cluster?.id }/v1/${ NAMESPACE }/${ name }`,
          method: 'DELETE',
        });
      } catch (e) {
        throw new Error(`${ this.t('k3k.errors.deletingNamespace') }\n${ e?.message || e }`, { cause: e });
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
    <K3kVersionBanner :parent-cluster="parentCluster" />
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
        :weight="11"
      >
        <InstallK3k
          v-model:parent-cluster="parentCluster"
          v-model:k3k-installed="k3kInstalled"
          :parent-cluster-display-annotation="parentClusterDisplayAnnotation"
          :mode="mode"
          :clusters="provClusters"
          :rules="{hostCluster: fvGetAndReportPathRules('parentCluster.id')}"
          @error="handleInstallationError"
        />

        <ClusterPolicy
          ref="clusterPolicy"
          v-model:target-namespace="k3kCluster.metadata.namespace"
          v-model:policy="policy"
          :host-cluster="parentCluster"
          :k3k-installed="k3kInstalled"
          :mode="mode"
          :rules="{namespace:fvGetAndReportPathRules('metadata.namespace'), policy:fvGetAndReportPathRules('policyForValidation')}"
        />

        <div class="row mb-20">
          <div class="col span-6">
            <LabeledSelect
              :value="k3kCluster.spec.version || defaultVersionLabel"
              label-key="k3k.k3sVersion.label"
              :options="k3sVersionOptions"
              :mode="mode"
              @update:value="updateVersion"
            />
          </div>
        </div>

        <template
          v-if="!policy"
        >
          <Mode
            v-model:k3k-mode="k3kCluster.spec.mode"
            :mode="mode"
            @update:k3k-mode="k3kCluster.spec.sync = {}"
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
        v-if="!policy"
        name="sync"
        label-key="k3k.policy.tabs.resourceSync"
        :weight="10"
      >
        <Sync
          v-if="isSharedMode"
          v-model:ingresses="k3kCluster.spec.sync.ingresses"
          v-model:priority-classes="k3kCluster.spec.sync.priorityClasses"
          v-model:storage-classes="k3kCluster.spec.sync.storageClasses"
          :mode="mode"
          :context="SYNC_CONTEXT.cluster"
        />
        <NotAllowed v-else />
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
        v-if="!policy && supportsTopology"
        name="affinity"
        label-key="k3k.policy.tabs.topology"
        :weight="8"
      >
        <PolicyAffinity
          v-model:server-affinity="k3kCluster.spec.serverAffinity"
          v-model:agent-affinity="k3kCluster.spec.agentAffinity"
          :mode="mode"
        />
      </Tab>
      <Tab
        name="Networking"
        label-key="k3k.sections.networking"
        :weight="7"
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
        :weight="6"
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
        name="advanced"
        label-key="k3k.sections.advanced"
        :weight="5"
      >
        <div class="gap-md">
          <RcSection
            mode="with-header"
            :expandable="true"
            :expanded="true"
            type="secondary"
            :title="t('k3k.secretMounts.title')"
            background="secondary"
          >
            <template #counter>
              <RcCounterBadge
                :count="(k3kCluster?.spec?.secretMounts || []).length"
                type="inactive"
              />
            </template>
            <div class="gap-md">
              <SecretMounts
                :mode="mode"
                :parent-cluster="parentCluster"
                :target-namespace="k3kCluster.metadata.namespace"
                :secret-mounts="k3kCluster.spec.secretMounts || []"
                @update:secret-mounts="k3kCluster.spec.secretMounts = $event"
              />
            </div>
          </RcSection>
          <RcSection
            mode="with-header"
            :expandable="true"
            :expanded="false"
            type="secondary"
            background="secondary"
            :title="t('component.resource.detail.metadata.labelsAndAnnotations')"
          >
            <Labels
              v-model:value="localValue"
              :mode="mode"
            />
          </RcSection>
        </div>
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
