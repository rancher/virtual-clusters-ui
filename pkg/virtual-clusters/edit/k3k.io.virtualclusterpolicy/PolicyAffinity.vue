<script setup lang="ts">
import { computed } from 'vue';
import NodeAffinity from '@shell/components/form/NodeAffinity';
import PodAffinity from '@shell/components/form/PodAffinity';
import { RcSection } from '@components/RcSection';
import { RcContentGroup } from '@components/Layout';
import type { AffinityValue } from '../../types/k3k';
import NotAllowed, { NOT_ALLOWED_SECTIONS } from '../../components/Sync/NotAllowed.vue';
import { MODES } from '../../utils/shared';

const props = defineProps<{
  serverAffinity?: AffinityValue;
  agentAffinity?: AffinityValue;
  /** Form mode - create/edit/view */
  mode: string;
  /** Virtual cluster mode - shared/virtual/hcp */
  k3kMode?: string;
}>();

/**
 * HCP worker nodes are registered externally, so there are no agent pods on the
 * host for these host-level scheduling rules to apply to.
 */
const agentSchedulingAllowed = computed(() => props.k3kMode !== MODES.HCP);

// eslint-disable-next-line func-call-spacing
const emit = defineEmits<{
  // eslint-disable-next-line no-unused-vars
  (e: 'update:server-affinity', value: AffinityValue): void;
  // eslint-disable-next-line no-unused-vars
  (e: 'update:agent-affinity', value: AffinityValue): void;
}>();

const updateServerNodeAffinity = (nodeAffinity: AffinityValue) => {
  emit('update:server-affinity', {
    ...(props.serverAffinity || {}),
    nodeAffinity
  });
};

const updateServerPodAffinity = (value: { affinity: AffinityValue }) => {
  emit('update:server-affinity', value.affinity);
};

const updateAgentNodeAffinity = (nodeAffinity: AffinityValue) => {
  emit('update:agent-affinity', {
    ...(props.agentAffinity || {}),
    nodeAffinity
  });
};

const updateAgentPodAffinity = (value: { affinity: AffinityValue }) => {
  emit('update:agent-affinity', value.affinity);
};
</script>

<template>
  <RcContentGroup>
    <RcSection
      type="secondary"
      mode="with-header"
      :expandable="true"
      :title="t('k3k.policy.affinity.serverNodeScheduling')"
    >
      <RcContentGroup>
        <p class="text-deemphasized">
          {{ t('k3k.policy.affinity.serverDescription') }}
        </p>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.affinity.nodeSelectors')"
        >
          <NodeAffinity
            :value="serverAffinity?.nodeAffinity || {}"
            :mode="mode"
            :use-rc="true"
            @update:value="updateServerNodeAffinity"
          />
        </RcSection>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.affinity.podSelectors')"
        >
          <PodAffinity
            :value="{affinity: serverAffinity}"
            :mode="mode"
            :use-rc="true"
            @update="updateServerPodAffinity"
          />
        </RcSection>
      </RcContentGroup>
    </RcSection>
    <RcSection
      type="secondary"
      mode="with-header"
      :expandable="true"
      :expanded="agentSchedulingAllowed"
      :title="t('k3k.policy.affinity.agentNodeScheduling')"
    >
      <RcContentGroup
        v-if="agentSchedulingAllowed"
      >
        <p class="text-deemphasized">
          {{ t('k3k.policy.affinity.agentDescription') }}
        </p>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.affinity.nodeSelectors')"
        >
          <NodeAffinity
            :value="agentAffinity?.nodeAffinity || {}"
            :mode="mode"
            :use-rc="true"
            @update:value="updateAgentNodeAffinity"
          />
        </RcSection>
        <RcSection
          type="secondary"
          mode="with-header"
          :expandable="true"
          :title="t('k3k.policy.affinity.podSelectors')"
        >
          <PodAffinity
            :value="{affinity: agentAffinity}"
            :mode="mode"
            :use-rc="true"
            @update="updateAgentPodAffinity"
          />
        </RcSection>
      </RcContentGroup>
      <NotAllowed
        v-else
        :mode="k3kMode"
        :section="NOT_ALLOWED_SECTIONS.AGENT_SCHEDULING"
      />
    </RcSection>
  </RcContentGroup>
</template>
