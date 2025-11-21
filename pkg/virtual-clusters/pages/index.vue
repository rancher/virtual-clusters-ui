<script>
import { K3K } from '../types';
import { CAPI, MANAGEMENT } from '@shell/config/types';
import { NAME as PRODUCT_NAME } from '../config/k3k-explorer-product';
import InstallK3k from '../components/InstallK3k.vue';
import { K3K_CHART_NAMESPACE, K3K_CHART_NAME, verifyK3kIsInstalled, verifyUserCanInstallK3k } from '../utils/k3kInstalled';
import Loading from '@shell/components/Loading';
import { isRancherPrime } from '@shell/config/version';
import { NAME as MGMT_NAME } from '@shell/config/product/manager';

export default {
  name: 'K3kExplorerLandingPage',

  components: { InstallK3k, Loading },

  async fetch() {
    this.isPrime = isRancherPrime();
    if (this.isPrime) {
      const currentCluster = this.$store.getters['currentCluster'];
      const provClusterId = currentCluster.provClusterId;

      this.isLocal = currentCluster.id === 'local';

      try {
        this.currentProvCluster = await this.$store.dispatch('management/find', {
          type: CAPI.RANCHER_CLUSTER, id: provClusterId, opt: { force: true }
        });
      } catch {}

      const hostClusterId = this.currentProvCluster.metadata?.annotations?.['ui.rancher/parent-cluster'];

      this.isVirtual = !!hostClusterId;

      let k3kIsAlreadyInstalled;

      try {
        k3kIsAlreadyInstalled = await verifyK3kIsInstalled(this.$store, currentCluster.id);
      } catch (e) {
      }

      if (k3kIsAlreadyInstalled) {
        this.$router.replace({
          name:   'c-cluster-product-resource',
          params: {
            ...this.$router.currentRoute.params,
            resource: K3K.POLICY,
            product:  PRODUCT_NAME
          }
        });
      } else {
        this.canInstallK3k = await verifyUserCanInstallK3k(this.$store, currentCluster.id);
      }
    }
  },

  data() {
    return {
      isLocal:            false,
      isPrime:            false,
      isVirtual:          false,
      canInstallK3k:      false,
      chartName:          K3K_CHART_NAME,
      targetNamespace:    K3K_CHART_NAMESPACE,
      currentProvCluster: null,
      k3kInstalled:       false, // fetch will redirect away from this page if k3k is already installed. This variable tracks if k3k has been installed using the button on this page
      managerUrl:                      this.$router.resolve({
        name:   'c-cluster-product-resource',
        params: {
          product:  MGMT_NAME,
          resource: CAPI.RANCHER_CLUSTER
        }
      }).href,
      managerUrlFiltered:                      this.$router.resolve({
        name:   'c-cluster-product-resource',
        params: {
          product:  MGMT_NAME,
          resource: CAPI.RANCHER_CLUSTER
        },
        query: { q: '!virtual' }
      }).href,
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
    <div
      v-if="!isPrime"
      v-clean-html="t('k3k.landingPage.prime')"
    />
    <div
      v-else-if="isLocal"
      v-clean-html="t('k3k.landingPage.local', { managerUrl }, true)"
    />
    <div
      v-else-if="isVirtual"
    >
      <span
        v-clean-html="t('k3k.landingPage.virtual.description', {managerUrlFiltered}, true)"
      />
    </div>
    <div
      v-else-if="!canInstallK3k"
      v-clean-html="t('k3k.landingPage.permission', null, true)"
    />
    <div v-else>
      <div class="mb-20">
        {{ t('k3k.landingPage.description') }}
      </div>
      <div class="steps">
        <h4>{{ t('k3k.landingPage.steps.title', null, true) }}</h4>
        <ol>
          <li class="mb-20">
            <h4>{{ t('k3k.landingPage.steps.step1.title') }}</h4>
            <div>{{ t('k3k.landingPage.steps.step1.description') }}</div>
            <InstallK3k
              v-if="currentProvCluster"
              v-model:k3k-installed="k3kInstalled"
              :parent-cluster="currentProvCluster"
              :show-button-only="true"
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
           margin-right: 10px;
        }
    }

    .provisioning-steps {
        list-style-type: step3decimal;
        list-style-position: inside;
        padding-left: 0px;
    }
</style>
