<script>
import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import RcLabelsAndAnnotations from '@shell/components/RcLabelsAndAnnotations.vue';
import CreateEditView from '@shell/mixins/create-edit-view';
import FormValidation from '@shell/mixins/form-validation';
import { RcSection } from '@components/RcSection';
import { RcContentGroup } from '@components/Layout';
import NameNsDescription from '@shell/components/form/NameNsDescription';
import ContainerResourceLimit from '@shell/components/ContainerResourceLimit';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import { exceptionToErrorsArray } from '@shell/utils/error';
import { clear } from '@shell/utils/array';
import { Banner } from '@rancher/components';
import RcKeyValue from '@shell/components/form/RcKeyValue.vue';

import { set } from '@shell/utils/object';

import Projects from './Projects.vue';
import PolicyAffinity from './PolicyAffinity.vue';
import { ANNOTATIONS, K3K } from '../../types';
import Mode from '../../components/Mode.vue';
import Sync from '../../components/Sync';
import NotAllowed from '../../components/Sync/NotAllowed.vue';

import Quota from './Quota.vue';
import isEmpty from 'lodash/isEmpty';
import { MODES } from '../../utils/shared';
import K3kVersionBanner from '../../components/K3kVersionBanner.vue';
import { fieldIsSupported } from '../../utils/k3kInstalled';

const CONTAINER_LIMIT_TYPE = 'Container';

export default {
  name: 'CRUClusterPolicy',

  mixins: [CreateEditView, FormValidation],

  components: {
    CruResource,
    Loading,
    NameNsDescription,
    Mode,
    RcSection,
    RcContentGroup,
    RcLabelsAndAnnotations,
    ContainerResourceLimit,
    Quota,
    LabeledSelect,
    Projects,
    PolicyAffinity,
    Checkbox,
    Banner,
    Sync,
    K3kVersionBanner,
    RcKeyValue,
    NotAllowed
  },

  // provisioning cluster object - needed when the policy form is shown in a drawer during cluster creation
  props: {
    parentCluster: {
      type:    Object,
      default: null
    },
  },

  async fetch() {
    if (!this.value.spec) {
      this.value.spec = {
        allowedMode: MODES.SHARED,
        sync:        { storageClasses: { enabled: true } }
      };
    }
    const selectedCluster = this.parentCluster || this.$store.getters['currentCluster'];
    const mgmtId = selectedCluster?.mgmt?.id || selectedCluster?.id;

    if (!mgmtId) {
      this.supportsTopology = false;

      return;
    }

    try {
      this.supportsTopology = await fieldIsSupported(this.$store, mgmtId, K3K.POLICY, 'spec.defaultServerAffinity');
    } catch {
      this.supportsTopology = false;
    }
  },

  data() {
    return {
      errors:         [],
      fvFormRuleSets: [{
        path:  'name',
        rules: ['required'],
      }],
      supportsTopology: false // Only k3k >= 1.1.0 supports the fields in the 'Topology' tab
    };
  },

  computed: {
    noneOption() {
      return this.t('generic.none');
    },

    // format limits to match project/namespace so we can use the same component
    defaultLimits: {
      get() {
        const limit = (this.value.spec?.limit?.limits || []).find((l) => l.type === CONTAINER_LIMIT_TYPE) || {};

        const { max = {}, defaultRequest = {} } = limit;

        return {
          limitsCpu:      max.cpu,
          limitsMemory:   max.memory,
          limitsGpu:      max['nvidia.com/gpu'],
          requestsCpu:    defaultRequest.cpu,
          requestsMemory: defaultRequest.memory
        };
      },

      set({
        limitsCpu, limitsMemory, requestsCpu, requestsMemory, limitsGpu
      }) {
        if (!this.value.spec.limit) {
          this.value.spec.limit = {};
        }
        if (!this.value.spec.limit.limits) {
          this.value.spec.limit.limits = [];
        }
        const neu = {
          type:           CONTAINER_LIMIT_TYPE,
          max:            {},
          defaultRequest: {}
        };

        if (limitsCpu !== undefined) {
          neu.max.cpu = limitsCpu;
        }

        if (limitsMemory !== undefined) {
          neu.max.memory = limitsMemory;
        }

        if (requestsCpu !== undefined) {
          neu.defaultRequest.cpu = requestsCpu;
        }

        if (requestsMemory !== undefined) {
          neu.defaultRequest.memory = requestsMemory;
        }
        if (limitsGpu !== undefined) {
          neu.max['nvidia.com/gpu'] = limitsGpu;
        }
        this.value.spec.limit.limits = [neu];
      }
    },

    quota: {
      get() {
        return this.value?.spec?.quota?.hard || {};
      },
      set(neu = {}) {
        if (!this.value.spec.quota) {
          this.value.spec.quota = {};
        }
        this.value.spec.quota.hard = neu;
      }
    },

    podSecurityAdmissionLevel: {
      get() {
        return this.value.spec.podSecurityAdmissionLevel || this.noneOption;
      },
      set(neu) {
        if (neu === this.noneOption) {
          delete this.value.spec.podSecurityAdmissionLevel;
        } else {
          this.value.spec.podSecurityAdmissionLevel = neu;
        }
      }
    },

    ingresses: {
      get() {
        return this.value?.spec?.sync?.ingresses || {};
      },
      set(neu) {
        set(this.value, 'spec.sync.ingresses', neu);
      }
    },

    priorityClasses: {
      get() {
        return this.value?.spec?.sync?.priorityClasses || {};
      },
      set(neu) {
        set(this.value, 'spec.sync.priorityClasses', neu);
      }
    },

    storageClasses: {
      get() {
        return this.value?.spec?.sync?.storageClasses || {};
      },
      set(neu) {
        set(this.value, 'spec.sync.storageClasses', neu);
      }
    },

    isSharedMode() {
      return this.value?.spec?.allowedMode === MODES.SHARED;
    },

    isHcpMode() {
      return this.value?.spec?.allowedMode === MODES.HCP;
    },

    hasNodeSelector() {
      return !isEmpty(this.value?.spec?.defaultNodeSelector || {});
    },

    showNodeSelector() {
      return !this.supportsTopology || this.hasNodeSelector;
    },
  },

  methods: {
    annotatePolicyWithProjects(projects = []) {
      if (!projects.length) {
        this.value.setAnnotation([ANNOTATIONS.POLICY_ASSIGNED_TO], '');
      } else {
        this.value.setAnnotation([ANNOTATIONS.POLICY_ASSIGNED_TO], projects.map((p) => p.id).join(', '));
      }
    },

    /**
     * Save the policy then start annotating namespaces
     * The component responsible for annotating namespaces will emit 'finish' event to tell this component to call create-edit-view 'done' method and return to list
     */
    async saveOverride(cb, depth) {
      if ( this.errors ) {
        clear(this.errors);
      }

      try {
        await this.actuallySave();
        const projectComponent = this.$refs['project-selector'];

        if (projectComponent) {
          await projectComponent.annotateAndSaveNamespaces();
        } else {
          cb(true);
        }
      } catch (err) {
        // This exception handles errors from the `request` action when it receives a failed http request. The `err` object could be from the action's error handler (raw http response object containing `status`) or thrown later on given the response of the action (a massaged object containing `_status`). TBD why one 409 triggers the error handler and another does not.
        const IS_ERR_409 = err.status === 409 || err._status === 409;

        // Conflict, the resource being edited has changed since starting editing
        if (IS_ERR_409 && depth === 0 && this.isEdit) {
          const errors = await this.conflict();

          if ( errors === false ) {
            // It was automatically figured out, save again
            return this.saveOverride(cb, depth + 1);
          } else {
            this.errors = errors;
          }
        } else {
          this.errors = exceptionToErrorsArray(err);
        }
        cb && cb(false);
      }
    },

    closeError(index) {
      this.errors = this.errors.filter((_, i) => i !== index);
    }
  }
};

</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <CruResource
    v-else
    :mode="mode"
    :resource="value"
    :validation-passed="fvFormIsValid"
    component-testid="cluster-explorer-virtual-cluster-policy"
    :show-toc="!parentCluster"
    @finish="saveOverride"
    @error="e=>errors=e"
  >
    <K3kVersionBanner :parent-cluster="parentCluster" />
    <Banner
      v-for="(err, i) in errors"
      :key="i"
      color="error"
      :data-testid="`error-banner${i}`"
      :label="err"
      :closable="true"
      @close="closeError(i)"
    />
    <NameNsDescription
      v-if="!isView"
      :name-col-span="4"
      :description-col-span="8"
      :mode="mode"
      :namespaced="false"
      :value="value"
      :create-namespace-override="true"
      :rules="{name:fvGetAndReportPathRules('name')}"
    />

    <RcSection
      type="primary"
      mode="with-header"
      :expandable="true"
      :title="t('k3k.policy.tabs.config')"
    >
      <RcContentGroup>
        <Projects
          ref="project-selector"
          :mode="mode"
          :policy="value"
          @update:selected-projects="annotatePolicyWithProjects"
          @finish="done"
        />
        <Mode
          v-model:k3k-mode="value.spec.allowedMode"
          :mode="mode"
          @update:k3k-mode="sync = {}"
        />
      </RcContentGroup>
    </RcSection>

    <RcSection
      type="primary"
      mode="with-header"
      :expandable="true"
      :title="t('k3k.policy.tabs.resourceSync')"
    >
      <Sync
        v-if="isSharedMode"
        v-model:ingresses="ingresses"
        v-model:priority-classes="priorityClasses"
        v-model:storage-classes="storageClasses"
        :mode="mode"
        :parent-cluster="parentCluster"
        @error="errors.push($event)"
      />
      <NotAllowed
        v-else
        :mode="value.spec.allowedMode"
        section="synchronization"
      />
    </RcSection>

    <RcSection
      type="primary"
      :expandable="true"
      mode="with-header"
      :title="t('k3k.policy.tabs.resourceAllocation')"
    >
      <RcContentGroup>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.headers.quotas')"
        >
          <Quota
            v-model:value="quota"
            :mode="mode"
          />
        </RcSection>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.headers.resourceLimits')"
        >
          <ContainerResourceLimit
            v-model:value="defaultLimits"
            :mode="mode"
          />
        </RcSection>
      </RcContentGroup>
    </RcSection>

    <RcSection
      v-if="supportsTopology"
      type="primary"
      :expandable="true"
      mode="with-header"
      :title="t('k3k.policy.tabs.topology')"
    >
      <PolicyAffinity
        v-model:server-affinity="value.spec.defaultServerAffinity"
        v-model:agent-affinity="value.spec.defaultAgentAffinity"
        :mode="mode"
        :k3k-mode="value.spec.allowedMode"
      />
    </RcSection>

    <RcSection
      type="primary"
      :expandable="true"
      mode="with-header"
      :title="t('k3k.policy.tabs.advanced')"
    >
      <RcContentGroup>
        <Banner
          v-if="supportsTopology && hasNodeSelector"
          label-key="k3k.nodeSelector.warning"
          color="warning"
        />
        <div
          v-if="showNodeSelector"
          class="input-row"
        >
          <RcKeyValue
            v-model:value="value.spec.defaultNodeSelector"
            :initial-empty-row="true"
            :mode="mode"
            :read-allowed="false"
            :title="t('k3k.nodeSelector.label')"
            :add-label="t('k3k.nodeSelector.addLabel')"
          >
            <template #title>
              <h3>{{ t('k3k.nodeSelector.label') }}</h3>
              <t
                class="text-deemphasized"
                raw
                k="k3k.nodeSelector.tooltip"
              />
            </template>
          </RcKeyValue>
        </div>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :expanded="!isHcpMode"
          :title="t('k3k.policy.security.label')"
        >
          <div v-if="!isHcpMode">
            <t
              class="text-deemphasized"
              k="k3k.policy.security.tooltip"
              raw
            />
            <div class="input-row mmt-1">
              <LabeledSelect
                v-model:value="podSecurityAdmissionLevel"
                class="half"
                :mode="mode"
                :options="[noneOption,'privileged', 'baseline', 'restricted']"
                :label="t('cluster.rke2.defaultPodSecurityAdmissionConfigurationTemplateName.label')"
              />
            </div>
          </div>

          <NotAllowed
            v-else
            :mode="value.spec.allowedMode"
            section="security"
          />
        </RcSection>

        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.isolation.label')"
          :expanded="!isHcpMode"
        >
          <div v-if="!isHcpMode">
            <div class="mmb-3">
              <t
                class="text-deemphasized"
                k="k3k.policy.isolation.tooltip"
                raw
              />
              <a
                aria-label="link to the K3K github repository"
                href="https://github.com/rancher/k3k/blob/main/docs/virtualclusterpolicy.md#4-managing-network-isolation-disablenetworkpolicy"
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <t
                  k="k3k.policy.isolation.learnMore"
                  raw
                />
                <i class="icon icon-sm icon-external-link" />
              </a>
            </div>
            <Checkbox
              v-model:value="value.spec.disableNetworkPolicy"
              :mode="mode"
              :label="t('k3k.policy.isolation.checkbox')"
            />
          </div>
          <NotAllowed
            v-else
            :mode="value.spec.allowedMode"
            section="isolation"
          />
        </RcSection>
        <RcLabelsAndAnnotations
          :mode="mode"
          :value="value"
          type="secondary"
          :use-rc-button="true"
          :expanded="false"
        />
      </RcContentGroup>
    </RcSection>
  </CruResource>
</template>

<style lang="scss">
  .vertical-checkboxes {
    display: flex;
    flex-direction: column;
  }
</style>
