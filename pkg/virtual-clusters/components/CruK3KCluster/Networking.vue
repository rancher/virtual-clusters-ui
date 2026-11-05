<script>
import { _CREATE } from '@shell/config/query-params';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import { RcSection } from '@components/RcSection';
import { RcContentGroup } from '@components/Layout';
import { MODES } from '../Mode.vue';
import Expose from './Expose.vue';
import TlsSans from './TlsSans.vue';

export default {
  name: 'K3kClusterNetworking',

  emits: ['update:clusterCIDR', 'update:serviceCIDR', 'update:clusterDNS', 'update:tlsSANs', 'update:expose'],

  components: {
    LabeledInput,
    RcSection,
    RcContentGroup,
    Expose,
    TlsSans
  },

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    clusterCIDR: {
      type:    String,
      default: ''
    },

    serviceCIDR: {
      type:    String,
      default: ''
    },

    clusterDNS: {
      type:    String,
      default: ''
    },

    tlsSANs: {
      type:    Array,
      default: () => []
    },

    expose: {
      type:    Object,
      default: () => {
        return {};
      },

    },

    virtualClusterMode: {
      type:    String,
      default: MODES.SHARED
    },

    rules: {
      type:    Object,
      default: () => {}
    },
  },

  computed: {
    isShared() {
      return this.virtualClusterMode === MODES.SHARED;
    }
  }

};
</script>

<template>
  <RcContentGroup>
    <RcSection
      type="secondary"
      mode="with-header"
      :expandable="true"
      :expanded="true"
      :title="t('k3k.networking.addresses.label')"
    >
      <RcContentGroup>
        <div class="k3k-input-row">
          <LabeledInput
            :value="clusterCIDR"
            label-key="k3k.clusterCIDR.label"
            placeholder-key="k3k.clusterCIDR.placeholder"
            :mode="mode"
            class="k3k-half"
            @update:value="e=>$emit('update:clusterCIDR', e)"
          />
        </div>
        <div>
          <div class="k3k-input-row">
            <LabeledInput
              :value="serviceCIDR"
              label-key="k3k.serviceCIDR.label"
              placeholder-key="k3k.serviceCIDR.placeholder"
              :mode="mode"
              class="k3k-half"
              @update:value="e=>$emit('update:serviceCIDR', e)"
            />
          </div>
          <t
            v-if="isShared"
            k="k3k.serviceCIDR.tooltip"
            class="text-label"
          />
        </div>
        <div class="k3k-input-row">
          <LabeledInput
            :value="clusterDNS"
            label-key="k3k.clusterDNS.label"
            placeholder-key="k3k.clusterDNS.placeholder"
            :mode="mode"
            class="k3k-half"
            @update:value="e=>$emit('update:clusterDNS', e)"
          />
        </div>
      </RcContentGroup>
    </RcSection>

    <RcSection
      type="secondary"
      mode="with-header"
      :expandable="true"
      :expanded="false"
      :title="t('k3k.tlsSANs.title')"
    >
      <TlsSans
        :value="tlsSANs"
        :mode="mode"
        :rules="rules.tlsSANs || []"
        @update:value="e=>$emit('update:tlsSANs', e)"
      />
    </RcSection>

    <!-- EXPOSE -->
    <RcSection
      type="secondary"
      mode="with-header"
      :expandable="true"
      :expanded="false"
      :title="t('k3k.expose.label')"
    >
      <Expose
        :expose="expose"
        :mode="mode"
        :rules="rules.expose || []"
        @update:expose="e=>$emit('update:expose', e)"
      />
    </RcSection>
  </RcContentGroup>
</template>
