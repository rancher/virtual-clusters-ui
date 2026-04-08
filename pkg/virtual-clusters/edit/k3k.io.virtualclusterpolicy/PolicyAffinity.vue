<script setup lang="ts">
import NodeAffinity from '@shell/components/form/NodeAffinity';
import PodAffinity from '@shell/components/form/PodAffinity';
import type { AffinityValue } from '../../types/k3k';

const props = defineProps<{
  serverAffinity: AffinityValue;
  agentAffinity: AffinityValue;
  mode: string;
}>();

// eslint-disable-next-line func-call-spacing
const emit = defineEmits<{
  (e: 'update:serverAffinity', value: AffinityValue): void;
  (e: 'update:agentAffinity', value: AffinityValue): void;
}>();

const updateServerNodeAffinity = (nodeAffinity: AffinityValue) => {
  emit('update:serverAffinity', { ...props.serverAffinity, nodeAffinity });
};

const updateServerPodAffinity = (value: { affinity: AffinityValue }) => {
  emit('update:serverAffinity', value.affinity);
};

const updateAgentNodeAffinity = (nodeAffinity: AffinityValue) => {
  emit('update:agentAffinity', { ...props.agentAffinity, nodeAffinity });
};

const updateAgentPodAffinity = (value: { affinity: AffinityValue }) => {
  emit('update:agentAffinity', value.affinity);
};
</script>

<template>
  <div>
    <h3>{{ t('k3k.policy.affinity.serverNodeScheduling') }}</h3>

    <div class="mb-20">
      <NodeAffinity
        :value="serverAffinity?.nodeAffinity || {}"
        :mode="mode"
        class="mb-20"
        @update:value="updateServerNodeAffinity"
      />
    </div>
    <div>
      <PodAffinity
        :value="{affinity: serverAffinity}"
        :mode="mode"
        @update="updateServerPodAffinity"
      />
    </div>
  </div>
  <div class="mt-40">
    <h3>{{ t('k3k.policy.affinity.agentNodeScheduling') }}</h3>

    <div class="mb-20">
      <NodeAffinity
        :value="agentAffinity?.nodeAffinity || {}"
        :mode="mode"
        class="mb-20"
        @update:value="updateAgentNodeAffinity"
      />
    </div>
    <div>
      <PodAffinity
        :value="{affinity: agentAffinity}"
        :mode="mode"
        @update="updateAgentPodAffinity"
      />
    </div>
  </div>
</template>
