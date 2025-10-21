<script>
import { K3K } from '../types';
import { CATALOG, SCHEMA } from '@shell/config/types';
import { NAME as PRODUCT_NAME } from '../config/k3k-explorer-product';
import InstallHelmCharts from '@shell/components/InstallHelmCharts';
import Loading from '@shell/components/Loading';
import { K3K_CHART_NAME, K3K_CHART_NAMESPACE, K3K_REPO_NAME, K3K_REPO_URL } from '../components/CruK3KCluster/HostCluster.vue';

export default {
  name: 'K3kExplorerLandingPage',

  components: { InstallHelmCharts, Loading },

  async fetch() {
    try {
      const k3kClusterSchema = await this.$store.dispatch('cluster/find', {
        type: SCHEMA,
        id:   K3K.CLUSTER,
        opt:  { force: true },
      });

      const appSchema = await this.$store.dispatch('cluster/find', {
        type: SCHEMA,
        id:   CATALOG.APP,
        opt:  { force: true },
      });

      const k3kApp = appSchema ? await this.$store.dispatch('cluster/find', { type: CATALOG.APP, id: `${ K3K_CHART_NAMESPACE }/${ K3K_CHART_NAME }` }) : null;

      if ((appSchema && k3kApp ) || (!appSchema && k3kClusterSchema)) {
        this.$router.replace({
          name:   'c-cluster-product-resource',
          params: {
            ...this.$router.currentRoute.params,
            resource: K3K.POLICY,
            product:  PRODUCT_NAME
          }
        });
      }
    } catch {
    }
  },

  data() {
    return {
      repoUrl:         K3K_REPO_URL,
      repoName:        K3K_REPO_NAME,
      chartName:       K3K_CHART_NAME,
      targetNamespace: K3K_CHART_NAMESPACE
    };
  },
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <div v-else>
    <div class="header mb-20">
      <img
        height="100"
        width="100"
        alt="k3k logo"
        src="../assets/icon-virtual-clusters.svg"
      />
      <div>
        <h2>
          {{ t('k3k.landingPage.title') }}
        </h2>
        <h3 class="text-label">
          {{ t('k3k.landingPage.subtitle') }}
        </h3>
      </div>
    </div>

    <div class="mb-20">
      {{ t('k3k.landingPage.description') }}
    </div>

    <div class="steps">
      <h4>{{ t('k3k.landingPage.steps.title', null, true) }}</h4>
      <ol>
        <li class="mb-20">
          <h4>{{ t('k3k.landingPage.steps.step1.title') }}</h4>
          <div>{{ t('k3k.landingPage.steps.step1.description') }}</div>
          <InstallHelmCharts
            class="mt-10"
            :chart-name="chartName"
            :repo-url="repoUrl"
            :repo-name="repoName"
            :target-namespace="targetNamespace"
          />
        </li>
        <li class="mb-20">
          <h4>{{ t('k3k.landingPage.steps.step2.title') }}</h4>
          <div>{{ t('k3k.landingPage.steps.step2.description') }}</div>
        </li>
        <li class="mb-20">
          <h4>{{ t('k3k.landingPage.steps.step3.title') }}</h4>
          <ol class="provisioning-steps">
            <li>
              {{ t('k3k.landingPage.steps.step3.substep1', null, true) }}
            </li>
            <li>
              {{ t('k3k.landingPage.steps.step3.substep2') }}
            </li>
            <li>
              {{ t('k3k.landingPage.steps.step3.substep3') }}
            </li>
          </ol>
        </li>
      </ol>
    </div>
  </div>
</template>

<style lang="scss" scoped>
    @counter-style step3decimal {
        system: numeric;
        symbols: '\30' '\31' '\32' '\33' '\34' '\35' '\36' '\37' '\38' '\39';
        /* symbols: '0' '1' '2' '3' '4' '5' '6' '7' '8' '9'; */
        prefix: '3.';
        suffix: " ";
    }

    .header {
        display: flex;
        align-items: center;

        & img {
            padding-right: 10px;
        }
    }

    .provisioning-steps {
        list-style-type: step3decimal;
        list-style-position: inside;
        padding-left: 0px;
    }
</style>
