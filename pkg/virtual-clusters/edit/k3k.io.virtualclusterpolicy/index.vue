<script>
import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import Labels from '@shell/components/form/Labels.vue';
import Mode from '../../components/Mode.vue';
import CreateEditView from '@shell/mixins/create-edit-view';
import FormValidation from '@shell/mixins/form-validation';
import Tab from '@shell/components/Tabbed/Tab';
import Tabbed from '@shell/components/Tabbed';
import NameNsDescription from '@shell/components/form/NameNsDescription';
import { RANCHER_TYPES } from '@shell/components/form/ResourceQuota/shared';
import ResourceQuota from '@shell/components/form/ResourceQuota/Project';
import ContainerResourceLimit from '@shell/components/ContainerResourceLimit';
import KeyValue from '@shell/components/form/KeyValue.vue';
import { MANAGEMENT, NAMESPACE } from '@shell/config/types';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import Checkbox from '@components/Form/Checkbox/Checkbox';

import Projects from './Projects.vue';
import { ANNOTATIONS } from '../../types';

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
    ResourceQuota,
    ContainerResourceLimit,
    KeyValue,
    LabeledSelect,
    Projects,
    Checkbox
  },

  async fetch() {
    if (!this.value.spec) {
      this.value.spec = {};
    }
    this.allPSAs = await this.$store.dispatch('management/findAll', { type: MANAGEMENT.PSA });
  },

  data() {
    return {
      allPSAs:                 [],
      projectAnnotationErrors: [],
      userCanTry:              false, // project status component will update this when it renders/removes Try Again buttons
    };
  },

  computed: {
    quotaTypes() {
      return RANCHER_TYPES;
    },

    // TODO nb use host cluster type
    defaultPsaOptionLabel() {
      const optionCase = !this.value.isK3s ? 'default' : 'none';

      return this.$store.getters['i18n/t'](`cluster.rke2.defaultPodSecurityAdmissionConfigurationTemplateName.option.${ optionCase }`);
    },

    psaOptions() {
      const out = [{
        label: this.$store.getters['i18n/t'](`cluster.rke2.defaultPodSecurityAdmissionConfigurationTemplateName.option.default`),
        value: ''
      }];

      if ( this.allPSAs ) {
        for ( const psa of this.allPSAs ) {
          out.push({
            label: psa.nameDisplay,
            value: psa.id,
          });
        }
      }
      const cur = this.value.spec?.podSecurityAdmissionLevel;

      if ( cur && !out.find((x) => x.value === cur) ) {
        out.unshift({ label: `${ cur } (Current)`, value: cur });
      }

      return out;
    },

  },

  methods: {
    updateName(e) {
      // console.log(e);
    },

    updateSelectedProjects(projects = []) {
      if (!projects.length) {
        this.value.setAnnotation([ANNOTATIONS.POLICY_ASSIGNED_TO], '');
      } else {
        this.value.setAnnotation([ANNOTATIONS.POLICY_ASSIGNED_TO], projects.map((p) => p.id).join(', '));
      }
    }
  }
};

</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <!-- TODO nb no can save when there are projects with 'try again' option available -->
  <CruResource
    v-else
    :mode="mode"
    :resource="value"
    :errors="fvUnreportedValidationErrors"
    :validation-passed="fvFormIsValid && !userCanTry"
    component-testid="cluster-explorer-virtual-cluster-policy"
    :cancel-event="true"
    @finish="save"
    @error="e => errors = e"
    @cancel="cancel"
  >
    <NameNsDescription
      v-if="!isView"
      :mode="mode"
      :namespaced="false"
      :value="value"
      :create-namespace-override="true"
      @update:value="updateName"
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
          v-model:errors="projectAnnotationErrors"
          v-model:user-can-try="userCanTry"
          :mode="mode"
          :policy="value"
          :register-after-hook="registerAfterHook"
          :register-before-hook="registerBeforeHook"
          @update:selected-projects="updateSelectedProjects"
        />
        <Mode
          v-model:k3k-mode="value.spec.allowedMode"
          :mode="mode"
        />
      </Tab>
      <Tab
        :weight="3"
        name="resources"
        label-key="k3k.policy.tabs.resourceAllocation"
      >
        <h3>{{ t('k3k.policy.headers.quotas') }}</h3>
        <!-- TODO nb proper spec path -->
        <!--  TODO nb not setting -->
        <ResourceQuota
          v-model:value="value.spec.quota"
          :mode="mode"
          :types="quotaTypes"
          class="mb-20"
        />
        <h3>{{ t('k3k.policy.headers.resourceLimits') }}</h3>
        <ContainerResourceLimit
          :value="value.spec.limits"
          :mode="mode"
          :namespace="value"
          :register-before-hook="registerBeforeHook"
          data-testid="namespace-container-resource-limit"
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
              v-model:value="value.spec.nodeSelector"
              :initial-empty-row="true"
              :mode="mode"
              :read-allowed="false"
              :title="t('k3k.nodeSelector.label')"
              :add-label="t('k3k.nodeSelector.addLabel')"
            >
              <template #title>
                <h4>{{ t('k3k.nodeSelector.label') }}</h4>
                <t
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
              k="k3k.policy.security.tooltip"
              raw
            />
            <a
              aria-label="link to the K3K github repository"
              href="https://github.com/rancher/k3k/blob/main/docs/virtualclusterpolicy.md#4-managing-network-isolation-disablenetworkpolicy"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              <t
                k="k3k.policy.security.learnMore"
                raw
              />
              <i class="icon icon-sm icon-external-link">
              </i></a>
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6">
            <LabeledSelect
              :value="value.spec.podSecurityAdmissionLevel"
              :options="psaOptions"
              :label="t('cluster.rke2.defaultPodSecurityAdmissionConfigurationTemplateName.label')"
            />
          </div>
        </div>

        <div class="row mb-10">
          <div class="col span-12">
            <h3>{{ t('k3k.policy.isolation.label') }}</h3>
            <t
              k="k3k.policy.isolation.tooltip"
              raw
            />
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

        <div class="row mb-10">
          <div class="col span-12">
            <h3>{{ t('k3k.policy.synchronization.label') }}</h3>
            <t
              k="k3k.policy.synchronization.tooltip"
              raw
            />
          </div>
        </div>
        <div class="row mb-20">
          <div class="col span-6 vertical-checkboxes">
            <Checkbox
              :mode="mode"
              :label="t('k3k.policy.synchronization.ingressCheckbox')"
            />
            <Checkbox
              :mode="mode"
              :label="t('k3k.policy.synchronization.priorityClassCheckbox')"
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
