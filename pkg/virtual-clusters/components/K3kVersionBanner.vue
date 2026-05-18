<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { Banner } from '@rancher/components';
import { verifyK3kVersionMatches } from '../utils/k3kInstalled';
import type { ParentClusterType } from '../types/k3k';

const props = withDefaults(defineProps<{ parentCluster?: ParentClusterType }>(), { parentCluster: null });

const store = useStore();
const showK3kVersionBanner = ref(false);

const targetMgmtId = computed<string | null>(() => {
  const resolvedParentCluster = props.parentCluster || store.getters.currentCluster || null;

  return resolvedParentCluster?.mgmt?.id || resolvedParentCluster?.id || null;
});

const chartsUrl = computed<string | null>(() => {
  if (!targetMgmtId.value) {
    return null;
  }

  // can't rely on useRouter() and router.resolve because router isn't always available with how this component is dynamically imported into a drawer in cluster creation
  const pathname = window.location.pathname;
  const clusterPathIndex = pathname.indexOf('/c/');
  const basePath = clusterPathIndex >= 0 ? pathname.slice(0, clusterPathIndex) : '';

  return `${ basePath }/c/${ targetMgmtId.value }/apps/charts`;
});

watch(targetMgmtId, async(neu) => {
  if (!neu) {
    showK3kVersionBanner.value = false;

    return;
  }

  const versionsMatch = await verifyK3kVersionMatches(store, neu);

  showK3kVersionBanner.value = versionsMatch === false;
}, { immediate: true });
</script>

<template>
  <Banner
    v-if="showK3kVersionBanner && chartsUrl"
    color="info"
  >
    <t
      k="k3k.hostCluster.k3kVersionMismatch"
      :url="chartsUrl"
      :raw="true"
    />
  </Banner>
</template>
