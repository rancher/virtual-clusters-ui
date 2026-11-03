<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import cloneDeep from 'lodash/cloneDeep';
import { _CREATE, _VIEW } from '@shell/config/query-params';
import LabeledInput from '@components/Form/LabeledInput/LabeledInput.vue';
import RadioButton from '@components/Form/Radio/RadioButton.vue';
import RcKeyValue from '@shell/components/form/RcKeyValue.vue';
import { Banner } from '@components/Banner';
import { RcSection, useReportInvalidToSection } from '@components/RcSection';
import { RcContentGroup } from '@components/Layout';

type ExposeRule = (expose: Record<string, any>) => string | null | undefined;

const EXPOSE_MODES = {
  INGRESS:       'ingress',
  LOAD_BALANCER: 'loadBalancer',
  NODE_PORT:     'nodePort',
  NONE:          'none'
};

const props = withDefaults(defineProps<{
  expose?: Record<string, any>;
  mode?: string;
  rules?: ExposeRule[];
}>(), {
  expose: () => ({}),
  mode:   _CREATE,
  rules:  () => [],
});

const emit = defineEmits<{
  'update:expose': [expose: Record<string, any>];
}>();

const store = useStore();
const t = (key: string) => store.getters['i18n/t'](key);

// expose can have one of ingress, loadBalancer, or node port defined
function initialExposeMode(): string {
  const { ingress, loadBalancer, nodePort } = props.expose;

  if (ingress && ingress.ingressClassName) {
    return EXPOSE_MODES.INGRESS;
  } else if (loadBalancer) {
    return EXPOSE_MODES.LOAD_BALANCER;
  } else if (nodePort) {
    return EXPOSE_MODES.NODE_PORT;
  }

  return EXPOSE_MODES.NONE;
}

const exposeMode = ref(initialExposeMode());

watch(exposeMode, (neu) => {
  const out = cloneDeep(props.expose || {});

  if (neu !== EXPOSE_MODES.NONE && !out[neu]) {
    out[neu] = {};
  }
  switch (neu) {
  case EXPOSE_MODES.INGRESS:
    delete out.loadBalancer;
    delete out.nodePort;
    break;
  case EXPOSE_MODES.LOAD_BALANCER:
    delete out.ingress;
    delete out.nodePort;
    break;
  case EXPOSE_MODES.NODE_PORT:
    delete out.loadBalancer;
    delete out.ingress;
    break;
  default:
    delete out.loadBalancer;
    delete out.ingress;
    delete out.nodePort;
  }
  emit('update:expose', out);
});

// radio buttons cannot show an error or report it to the enclosing RcSection, so this component does both
const errorMessage = computed(() => (props.mode === _VIEW ? '' : props.rules.map((rule) => rule(props.expose)).filter(Boolean).join(', ')));

useReportInvalidToSection(computed(() => !!errorMessage.value));
</script>

<template>
  <RcContentGroup>
    <Banner
      v-if="errorMessage"
      color="error"
      :label="errorMessage"
    />
    <t
      class="text-label"
      raw
      k="k3k.expose.description"
    />
    <div>
      <div class="mmb-2">
        <RadioButton
          v-model:value="exposeMode"
          :val="EXPOSE_MODES.NONE"
          :label="t('k3k.expose.notExposed.label')"
        />
      </div>

      <div class="mmb-2">
        <RadioButton
          v-model:value="exposeMode"
          :val="EXPOSE_MODES.INGRESS"
          :label="t('k3k.expose.ingress.label')"
        />
      </div>
      <div
        v-if="expose.ingress"
        class="mmb-4"
      >
        <RcSection
          type="secondary"
          mode="no-header"
          :title="t('k3k.expose.ingress.label')"
        >
          <RcContentGroup>
            <div>
              <div class="k3k-input-row">
                <LabeledInput
                  v-model:value="expose.ingress.ingressClassName"
                  label-key="k3k.expose.ingress.ingressClassName.label"
                  :mode="mode"
                  class="k3k-half"
                />
              </div>
              <t
                k="k3k.expose.ingress.ingressClassName.description"
                class="text-label"
                raw
              />
            </div>
            <div class="k3k-input-row">
              <RcKeyValue
                v-model:value="expose.ingress.annotations"
                :mode="mode"
                :add-label="t('k3k.expose.ingress.annotations.add')"
                :read-allowed="false"
                add-icon="icon-plus"
                use-rc-button
              >
                <template #title>
                  <h3 class="mb-0">
                    {{ t('k3k.expose.ingress.annotations.label') }}
                  </h3>
                </template>
              </RcKeyValue>
            </div>
          </RcContentGroup>
        </RcSection>
      </div>

      <div class="mmb-2">
        <RadioButton
          v-model:value="exposeMode"
          :label="t('k3k.expose.loadbalancer.label')"
          :val="EXPOSE_MODES.LOAD_BALANCER"
        />
      </div>
      <div
        v-if="expose.loadBalancer"
        class="mmb-4"
      >
        <RcSection
          type="secondary"
          mode="no-header"
          :title="t('k3k.expose.loadbalancer.label')"
        >
          <RcContentGroup>
            <div class="k3k-input-row">
              <div>
                <LabeledInput
                  v-model:value.number="expose.loadBalancer.serverPort"
                  type="number"
                  label-key="k3k.expose.loadbalancer.serverPort.label"
                  :placeholder="t('k3k.expose.loadbalancer.serverPort.placeholder')"
                  :mode="mode"
                  class="mmb-1"
                />
                <t
                  class="text-label"
                  raw
                  k="k3k.expose.loadbalancer.description"
                />
              </div>

              <LabeledInput
                v-model:value.number="expose.loadBalancer.etcdPort"
                type="number"
                label-key="k3k.expose.loadbalancer.etcdPort.label"
                :placeholder="t('k3k.expose.loadbalancer.etcdPort.placeholder')"
                :mode="mode"
              />
            </div>
          </RcContentGroup>
        </RcSection>
      </div>

      <div class="mmb-2">
        <RadioButton
          v-model:value="exposeMode"
          :label="t('k3k.expose.nodePort.label')"
          :val="EXPOSE_MODES.NODE_PORT"
        />
      </div>
      <div
        v-if="expose.nodePort"
        class="mmb-4"
      >
        <RcSection
          type="secondary"
          mode="no-header"
          :title="t('k3k.expose.nodePort.label')"
        >
          <RcContentGroup>
            <div class="k3k-input-row">
              <div>
                <LabeledInput
                  v-model:value.number="expose.nodePort.serverPort"
                  type="number"
                  label-key="k3k.expose.loadbalancer.serverPort.label"
                  :placeholder="t('k3k.expose.nodePort.serverPort.placeholder')"
                  :mode="mode"
                  class="mmb-1"
                />
                <t
                  raw
                  k="k3k.expose.nodePort.description"
                  class="text-label"
                />
              </div>
              <LabeledInput
                v-model:value.number="expose.nodePort.etcdPort"
                type="number"
                label-key="k3k.expose.loadbalancer.etcdPort.label"
                :placeholder="t('k3k.expose.nodePort.serverPort.placeholder')"
                :mode="mode"
              />
            </div>
          </RcContentGroup>
        </RcSection>
      </div>
    </div>
  </RcContentGroup>
</template>
