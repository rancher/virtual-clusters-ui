<script>
import CruResource, { CONTEXT_HOOK_EDIT_YAML } from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import Labels from '@shell/components/form/Labels';
import CreateEditView from '@shell/mixins/create-edit-view';
import FormValidation from '@shell/mixins/form-validation';
import Tab from '@shell/components/Tabbed/Tab';
import Tabbed from '@shell/components/Tabbed';
import NameNsDescription from '@shell/components/form/NameNsDescription';
import ContainerResourceLimit from '@shell/components/ContainerResourceLimit';
import KeyValue from '@shell/components/form/KeyValue.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import { exceptionToErrorsArray } from '@shell/utils/error';
import { clear } from '@shell/utils/array';
import { Banner } from '@rancher/components';

import Projects from './Projects.vue';
import { ANNOTATIONS } from '../../types';
import Mode from '../../components/Mode.vue';
import Sync from '../../components/Sync.vue';
import Quota from './Quota.vue';
import isEmpty from 'lodash/isEmpty';
import { MODES } from '../../utils/shared';

const CONTAINER_LIMIT_TYPE = 'Container';

export default {
  name: 'CRUClusterPolicy',

  mixins: [CreateEditView, FormValidation],

  components: {
    CruResource,
    Loading,
    NameNsDescription,
    Mode,
    Tabbed,
    Tab,
    Labels,
    ContainerResourceLimit,
    Quota,
    KeyValue,
    LabeledSelect,
    Projects,
    Checkbox,
    Banner,
    Sync
  },

  async fetch() {
    if (!this.value.spec) {
      this.value.spec = { allowedMode: MODES.SHARED };
    }
  },

  created() {
    this.registerBeforeHook(this.beforeYamlHook, 'assign-ns-before-edit-yaml');
  },

  data() {
    return {
      errors:         [],
      fvFormRuleSets:          [{
        path:  'name',
        rules: ['required'],
      }]
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
          limitsCpu: max.cpu, limitsMemory: max.memory, limitsGpu: max['nvidia.com/gpu'], requestsCpu: defaultRequest.cpu, requestsMemory: defaultRequest.memory
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

    sync: {
      get() {
        return this.value?.spec?.sync || {};
      },
      set(neu) {
        if (neu && !isEmpty(neu)) {
          this.value.spec.sync = neu;
        } else {
          delete this.value.spec.sync;
        }
      }
    },
    isSharedMode() {
      return this.value?.spec?.allowedMode === MODES.SHARED;
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

    updateSync(key, enabled) {
      if (!this.value.spec.sync) {
        this.value.spec.sync = {};
      }

      if (!this.value.spec.sync[key]) {
        this.value.spec.sync[key] = { enabled };
      } else {
        this.value.spec.sync[key].enabled = enabled;
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
          // eslint-disable-next-line node/no-callback-literal
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
        // eslint-disable-next-line node/no-callback-literal
        cb && cb(false);
      }
    },

    async beforeYamlHook(hookContext) {
      const projectComponent = this.$refs['project-selector'];

      const { annotateAndSaveNamespaces, hasErrors } = projectComponent || {};

      if (hookContext === CONTEXT_HOOK_EDIT_YAML && annotateAndSaveNamespaces) {
        await new Promise((resolve, reject) => {
          this.$store.dispatch('cluster/promptModal', {
            component:      'GenericPrompt',
            componentProps: {
              title:     this.t('k3k.policy.editYamlModal.title'),
              body:      this.t('k3k.policy.editYamlModal.body'),
              applyMode: 'editAndContinue',
              confirm:   async(confirmed) => {
                if (confirmed) {
                  await annotateAndSaveNamespaces();
                  if (hasErrors) {
                    reject(new Error('failed to annotate namespaces'));
                  } else {
                    resolve();
                  }
                } else {
                  reject(new Error('User Cancelled'));
                }
              }
            },
          });
        });
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
    :apply-hooks="applyHooks"
    @finish="saveOverride"
    @cancel="cancel"
    @error="e=>errors=e"
  >
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
      :mode="mode"
      :namespaced="false"
      :value="value"
      :create-namespace-override="true"
      :rules="{name:fvGetAndReportPathRules('name')}"
    >
    </NameNsDescription>

    <Tabbed
      :side-tabs="true"
    >
      <Tab
        :weight="4"
        name="config"
        label-key="k3k.policy.tabs.config"
      >
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
        <Sync
          v-if="isSharedMode"
          v-model:sync="sync"
          :mode="mode"
        />
      </Tab>
      <Tab
        :weight="3"
        name="resources"
        label-key="k3k.policy.tabs.resourceAllocation"
      >
        <h3>{{ t('k3k.policy.headers.quotas') }}</h3>
        <Quota
          v-model:value="quota"
          :mode="mode"
          class="mb-20"
        />
        <h3>{{ t('k3k.policy.headers.resourceLimits') }}</h3>
        <ContainerResourceLimit
          v-model:value="defaultLimits"
          :mode="mode"
        />
      </Tab>
      <Tab
        :weight="2"

        name="advanced"
        label-key="k3k.policy.tabs.advanced"
      >
        <div
          class="row mb-20"
        >
          <div class="col span-12">
            <KeyValue
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
                  class="text-muted"
                  raw
                  k="k3k.nodeSelector.tooltip"
                />
              </template>
            </KeyValue>
          </div>
        </div>

        <div class="row mb-10">
          <div class="col span-12">
            <h3>{{ t('k3k.policy.security.label') }}</h3>
            <t
              class="text-muted"
              k="k3k.policy.security.tooltip"
              raw
            />
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <LabeledSelect
              v-model:value="podSecurityAdmissionLevel"
              :mode="mode"
              :options="[noneOption,'privileged', 'baseline', 'restricted']"
              :label="t('cluster.rke2.defaultPodSecurityAdmissionConfigurationTemplateName.label')"
            />
          </div>
        </div>

        <div class="row mb-10">
          <div class="col span-12">
            <h3>{{ t('k3k.policy.isolation.label') }}</h3>
            <t
              class="text-muted"
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
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <Checkbox
              v-model:value="value.spec.disableNetworkPolicy"
              :mode="mode"
              :label="t('k3k.policy.isolation.checkbox')"
            />
          </div>
        </div>
      </Tab>
      <Tab
        :weight="1"
        name="labels"
        label-key="generic.labelsAndAnnotations"
      >
        <Labels
          :mode="mode"
          :value="value"
        />
      </Tab>
    </Tabbed>
  </CruResource>
</template>

<style lang="scss">
  .vertical-checkboxes {
    display: flex;
    flex-direction: column;
  }
</style>
