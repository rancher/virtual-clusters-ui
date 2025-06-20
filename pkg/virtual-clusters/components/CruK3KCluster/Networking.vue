<script>
import { _CREATE } from '@shell/config/query-params';
import ArrayList from '@shell/components/form/ArrayList';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import RadioButton from '@components/Form/Radio/RadioButton.vue';
import KeyValue from '@shell/components/form/KeyValue.vue';
import cloneDeep from 'lodash/cloneDeep';

export default {
  name: 'K3kClusterNetworking',

  emits: ['update:clusterCIDR', 'update:serviceCIDR', 'update:clusterDNS', 'update:tlsSANs', 'update:expose'],

  components: {
    LabeledInput,
    ArrayList,
    RadioButton,
    KeyValue
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
      }
    },
    rules: {
      type:    Object,
      default: () => {}
    },
  },

  data() {
    let exposeMode;
    const exposeModes = {
      INGRESS:       'ingress',
      LOAD_BALANCER: 'loadbalancer',
      NODE_PORT:     'nodePort',
      NONE:          'none'
    };
    // expose can have one of ingress, loadbalancer, or node port defined
    const { ingress, loadbalancer, nodePort } = this.expose;

    if (ingress && ingress.ingressClassName) {
      exposeMode = exposeModes.INGRESS;
    } else if (loadbalancer && (loadbalancer.serverPort || loadbalancer.etcdPort)) {
      exposeMode = exposeModes.LOAD_BALANCER;
    } else if (nodePort && ((nodePort.serverPort >= 30000 && nodePort.serverPort <= 32767) || (nodePort.etcdPort >= 30000 && nodePort.etcdPort <= 32767)) ) {
      exposeMode = exposeModes.NODE_PORT;
    } else {
      exposeMode = exposeModes.NONE;
    }

    return { exposeModes, exposeMode };
  },

  watch: {
    exposeMode(neu) {
      const out = cloneDeep(this.expose || {});

      if (neu !== this.exposeModes.NONE && !out[neu]) {
        out[neu] = {};
      }
      switch (neu) {
      case this.exposeModes.INGRESS:
        delete out.loadbalancer;
        delete out.nodePort;
        break;
      case this.exposeModes.LOAD_BALANCER:
        delete out.ingress;
        delete out.nodePort;
        break;
      case this.exposeModes.NODE_PORT:
        delete out.loadbalancer;
        delete out.ingress;
        break;
      default:
        delete out.loadbalancer;
        delete out.ingress;
        delete out.nodePort;
      }
      this.$emit('update:expose', out);
    }
  },

};
</script>

<template>
  <div>
    <div class="row mb-20">
      <div class="col span-6">
        <LabeledInput
          :value="clusterCIDR"
          label-key="k3k.clusterCIDR.label"
          placeholder-key="k3k.clusterCIDR.placeholder"
          :mode="mode"
          @update:value="e=>$emit('update:clusterCIDR', e)"
        />
      </div>
    </div>
    <div class="row mb-20">
      <div class="col span-6">
        <LabeledInput
          :value="serviceCIDR"
          label-key="k3k.serviceCIDR.label"
          placeholder-key="k3k.serviceCIDR.placeholder"
          :mode="mode"
          @update:value="e=>$emit('update:serviceCIDR', e)"
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
          :value="clusterDNS"
          label-key="k3k.clusterDNS.label"
          placeholder-key="k3k.clusterDNS.placeholder"
          :mode="mode"
          @update:value="e=>$emit('update:clusterDNS', e)"
        />
      </div>
    </div>
    <div class="row mb-20">
      <div class="col span-6">
        <ArrayList
          :value="tlsSANs"
          :protip="false"
          :mode="mode"
          :initial-empty-row="true"
          :title="t('k3k.tlsSANs.label')"
          :rules="rules.tlsSANs || []"
          :required="rules.tlsSANs && rules.tlsSANs.length"
          @update:value="e=>$emit('update:tlsSANs', e)"
        />
      </div>
    </div>

    <!-- EXPOSE -->
    <div class="mb-20">
      <h3>{{ t('k3k.expose.label') }}</h3>
      <t
        class="text-label"
        raw
        k="k3k.expose.description"
      />
    </div>
    <div class="row mb-5">
      <div class="col span-12">
        <RadioButton
          v-model:value="exposeMode"
          :val="exposeModes.NONE"
        >
          <template #label>
            <h4>
              {{ t('k3k.expose.notExposed.label') }}
            </h4>
          </template>
        </RadioButton>
      </div>
    </div>

    <div class="row">
      <div class="col span-12">
        <RadioButton
          v-model:value="exposeMode"
          :val="exposeModes.INGRESS"
        >
          <template #label>
            <h4>
              {{ t('k3k.expose.ingress.label') }}
            </h4>
          </template>
        </RadioButton>
      </div>
    </div>
    <div
      v-if="expose.ingress"
      class="row mb-20 radio-sub-row"
    >
      <div class="col span-6">
        <LabeledInput
          v-model:value="expose.ingress.ingressClassName"
          label-key="k3k.expose.ingress.ingressClassName.label"
          :mode="mode"
        />
      </div>
      <div class="col span-6 centered">
        <t
          k="k3k.expose.ingress.ingressClassName.description"
          class="text-label"
          raw
        />
      </div>
    </div>
    <div
      v-if="expose.ingress"
      class="row mb-20 radio-sub-row"
    >
      <div class="col span-12">
        <KeyValue
          v-model:value="expose.ingress.annotations"
          :mode="mode"
          :add-label="t('k3k.expose.ingress.annotations.add')"
          :read-allowed="false"
        >
          <template #title>
            <h4 class="mb-0">
              {{ t('k3k.expose.ingress.annotations.label') }}
            </h4>
          </template>
        </KeyValue>
      </div>
    </div>

    <div class="row mb-5">
      <div class="col span-12">
        <RadioButton
          v-model:value="exposeMode"
          :label="t('k3k.expose.loadbalancer.label')"
          :val="exposeModes.LOAD_BALANCER"
        >
          <template #label>
            <h4 class="mb-5">
              {{ t('k3k.expose.loadbalancer.label') }}
            </h4>
            <t
              class="text-label"
              raw
              k="k3k.expose.loadbalancer.description"
            />
          </template>
        </RadioButton>
      </div>
    </div>
    <div
      v-if="expose.loadbalancer"
      class="row mb-20 radio-sub-row"
    >
      <div class="col span-6">
        <LabeledInput
          v-model:value.number="expose.loadbalancer.serverPort"
          type="number"
          label-key="k3k.expose.loadbalancer.serverPort.label"
          :placeholder="t('k3k.expose.loadbalancer.serverPort.placeholder')"
          :mode="mode"
        />
      </div>
      <div class="col span-6">
        <LabeledInput
          v-model:value.number="expose.loadbalancer.etcdPort"
          type="number"
          label-key="k3k.expose.loadbalancer.etcdPort.label"
          :placeholder="t('k3k.expose.loadbalancer.etcdPort.placeholder')"
          :mode="mode"
        />
      </div>
    </div>

    <div class="row mb-5">
      <div class="col span-12">
        <RadioButton
          v-model:value="exposeMode"
          :label="t('k3k.expose.nodePort.label')"
          :val="exposeModes.NODE_PORT"
        >
          <template #label>
            <h4 class="mb-5">
              {{ t('k3k.expose.nodePort.label') }}
            </h4>
            <t
              class="text-label"
              raw
              k="k3k.expose.nodePort.description"
            />
          </template>
        </RadioButton>
      </div>
    </div>
    <div
      v-if="expose.nodePort"
      class="row mb-20 radio-sub-row"
    >
      <div class="col span-6">
        <LabeledInput
          v-model:value.number="expose.nodePort.serverPort"
          type="number"
          label-key="k3k.expose.loadbalancer.serverPort.label"
          :placeholder="t('k3k.expose.nodePort.serverPort.placeholder')"
          :mode="mode"
        />
      </div>
      <div class="col span-6">
        <LabeledInput
          v-model:value.number="expose.nodePort.etcdPort"
          type="number"
          label-key="k3k.expose.loadbalancer.etcdPort.label"
          :placeholder="t('k3k.expose.nodePort.serverPort.placeholder')"
          :mode="mode"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// this is the width of the radio circle + margin between radio and its label
.radio-sub-row{
  margin-left: 19px;
}
</style>
