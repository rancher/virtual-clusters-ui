<script>
import { K3K } from '../types';
import { CAPI, CATALOG, SCHEMA } from '@shell/config/types';
import { NAME as PRODUCT_NAME } from '../config/k3k-explorer-product';
import InstallK3k, { K3K_CHART_NAMESPACE, K3K_CHART_NAME } from '../components/InstallK3k.vue';
import Loading from '@shell/components/Loading';
import { allHash } from '@shell/utils/promise';

export default {
  name: 'K3kExplorerLandingPage',

  components: { InstallK3k, Loading },

  async fetch() {
    try {
      const currentCluster = this.$store.getters['currentCluster']
      const provClusterId = currentCluster.provClusterId
      const hash = await allHash({
        k3kClusterSchema:  this.$store.dispatch('cluster/find', {
          type: SCHEMA,
          id:   K3K.CLUSTER,
          opt:  { force: true },
        }),
        appSchema:  this.$store.dispatch('cluster/find', {
          type: SCHEMA,
          id:   CATALOG.APP,
          opt:  { force: true },
        }),
        currentProvCluster:  this.$store.dispatch('management/find', {type: CAPI.RANCHER_CLUSTER, id: provClusterId})
      });

      this.currentProvCluster = hash.currentProvCluster
      const k3kApp = hash.appSchema ? await this.$store.dispatch('cluster/find', { type: CATALOG.APP, id: `${ K3K_CHART_NAMESPACE }/${ K3K_CHART_NAME }` }) : null;

      if ((hash.appSchema && k3kApp ) || (!hash.appSchema && hash.k3kClusterSchema)) {
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
      chartName:       K3K_CHART_NAME,
      targetNamespace: K3K_CHART_NAMESPACE,
      currentProvCluster: null,
      k3kInstalled: false // fetch will redirect away from this page if k3k is already installed. This variable tracks if k3k has been installed using the button on this page
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
        src="../assets/icon-k3k.svg"
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

          <InstallK3k v-if="currentProvCluster" :parent-cluster="currentProvCluster" :show-button-only="true" v-model:k3k-installed="k3kInstalled" />
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
