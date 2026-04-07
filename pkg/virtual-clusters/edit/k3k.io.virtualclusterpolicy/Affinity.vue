<script>
import NodeAffinity from '@shell/components/form/NodeAffinity';
import PodAffinity from '@shell/components/form/PodAffinity';

export default {
  name: 'PolicyAffinty',

  components: { NodeAffinity, PodAffinity },

  emits: ['update:serverAffinity', 'update:agentAffinity'],

  props: {
    serverAffinity: {
      type:     Object,
      required: true,
    },

    agentAffinity: {
      type:     Object,
      required: true,
    },

    mode: {
      type:     String,
      required: true,
    },
  },

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
        @update:value="$emit('update:serverAffinity', {...serverAffinity, nodeAffinity:$event})"
      />
    </div>
    <div>
      <PodAffinity
        :value="{affinity: serverAffinity}"
        :mode="mode"
        @update="$emit('update:serverAffinity', $event.affinity)"
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
        @update:value="$emit('update:agentAffinity', {...agentAffinity, nodeAffinity:$event})"
      />
    </div>
    <div>
      <PodAffinity
        :value="{affinity: agentAffinity}"
        :mode="mode"
        @update="$emit('update:agentAffinity', $event.affinity)"
      />
    </div>
  </div>
</template>
