<script>
import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import Labels from '@shell/components/form/Labels.vue';
import Mode from '../components/Mode.vue';
import CreateEditView from '@shell/mixins/create-edit-view';
import FormValidation from '@shell/mixins/form-validation';
import Tab from '@shell/components/Tabbed/Tab';
import Tabbed from '@shell/components/Tabbed';
import NameNsDescription from '@shell/components/form/NameNsDescription';
import { RANCHER_TYPES } from '@shell/components/form/ResourceQuota/shared';
import ResourceQuota from '@shell/components/form/ResourceQuota/Project';
import ContainerResourceLimit from '@shell/components/ContainerResourceLimit';

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
    ContainerResourceLimit
  },

  computed: {
    policySpec: {
      get() {
        return this.value.spec || {};
      },
      set(neu) {
        this.value.spec = neu;
      }
    },

    quotaTypes() {
      return RANCHER_TYPES;
    }
  },

  methods: {
    updateName(e) {
      console.log(e);
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
    :errors="fvUnreportedValidationErrors"
    :validation-passed="fvFormIsValid"
    component-testid="cluster-explorer-virtual-cluster-policy"
    :cancel-event="true"
    @finish="saveOverride"
    @error="e => errors = e"
    @cancel="cancel"
  >
    <NameNsDescription
      v-if="!isView"
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
        <Mode
          v-model:k3k-mode="policySpec.mode"
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
        <ResourceQuota
          v-model:value="policySpec.quota"
          :mode="mode"
          :types="quotaTypes"
          class="mb-20"
        />
        <h3>{{ t('k3k.policy.headers.resourceLimits') }}</h3>
        <ContainerResourceLimit
          :value="policySpec.limits"
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
