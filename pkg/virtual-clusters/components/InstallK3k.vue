<script>
import { _CREATE } from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { saferDump } from '@shell/utils/create-yaml';
import AsyncButton from '@shell/components/AsyncButton';
import { sortBy } from '@shell/utils/sort';
import { mapGetters } from 'vuex';
import isEmpty from 'lodash/isEmpty';
import {
  K3K_REPO_NAME,
  K3K_REPO_URL,
  K3K_CHART_NAME,
  K3K_CHART_NAMESPACE,
  verifyK3kIsInstalled,
  verifyUserCanInstallK3k,
  verifyUserCanCreateK3kClusters
} from '../utils/k3kInstalled';

const DOWNLOAD_MAX_RETRIES = 10;
const RETRY_WAIT = 1000;
const K3K_VALUES = {
  agent: {
    shared: {
      image: {
        registry:   'registry.suse.com',
        repository: 'rancher/appco-k3k-kubelet'
      }
    }
  },
  controller: {
    image: {
      registry:   'registry.suse.com',
      repository: 'rancher/appco-k3k'
    }
  }
};

const INCLUDE_LOCAL = process.env.dev;

export default {
  name: 'K3kHostClusterAndInstallk3k',

  emits: ['update:parentCluster', 'update:k3kInstalled', 'error'],

  components: { LabeledSelect, AsyncButton },

  props: {
    // parent cluster's prov cluster
    parentCluster: {
      type:    Object,
      default: () => {
        return {};
      }
    },

    mode: {
      type:    String,
      default: _CREATE
    },

    // Array of all provisioning clusters
    clusters: {
      type:    Array,
      default: () => []
    },

    k3kInstalled: {
      type:    Boolean,
      default: false
    },

    showButtonOnly: {
      type:    Boolean,
      default: false
    }
  },

  created() {
    this.verifyK3kIsInstalledInCurrentCluster();
    if (this.mode === _CREATE) {
      this.getParentClusterInstallationStatus();
    }
  },

  data() {
    // track if k3k chart is present in the currently selected host cluster AND
    // track if the user installed k3k while viewing this page
    return {
      didInstallK3k:           false,
      localParentCluster:      this.parentCluster,
      allParentClusterOptions: [],
      loadingClusters:         false,
    };
  },

  watch: {
    parentClusterOptions: {
      handler(neu = []) {
        if (!this.parentCluster?.id && neu.length) {
          this.selectedParentOption = neu[0].value;
        }
      },
      immediate: true
    },
  },

  computed: {
    ...mapGetters({ t: 'i18n/withFallback' }),

    isCreate() {
      return this.mode === _CREATE;
    },

    parentClusterOptions() {
      const out = this.allParentClusterOptions.filter((opt) => {
        if (opt.isVirtual || !opt.isReady || (!INCLUDE_LOCAL && opt.isLocal)) {
          return false;
        }

        if (opt.k3kInstalled) {
          return opt.canCreateK3kClusters;
        }

        return opt.canInstallK3k;
      });

      return sortBy(out, 'label');
    },

    selectedParentOption: {
      get() {
        return this.parentClusterOptions.find((opt) => opt?.value?.id === this.localParentCluster?.id);
      },
      async set( value ) {
        const fullOption = this.parentClusterOptions.find((opt) => opt?.value?.id === value?.id);

        this.localParentCluster = value;
        this.didInstallK3k = false;

        this.$emit('update:k3kInstalled', fullOption.k3kInstalled);
        // using nextTick here ensures that ClusterPolicy.vue (and any other components that fetch resources in the parent cluster contingent on k3k installation)
        // have up to date install info when they get a new parent cluster id and start re-computing
        this.$nextTick(() => {
          this.$emit('update:parentCluster', value);
        });
      }
    }
  },

  methods: {
    isEmpty,
    // track which clusters already have k3k and the user has permission to create k3k clusters in,
    // and which clusters the user has permission to install k3k in
    async getParentClusterInstallationStatus() {
      this.loadingClusters = true;
      const out = [];

      for (const pCluster of this.clusters) {
        const mgmt = pCluster.mgmt;

        // installk3k function will update k3kInstalled and canCreateK3kCluster properties when it successfully installs k3k
        const [k3kInstalled, canInstallK3k, canCreateK3kClusters] = await Promise.all([
          verifyK3kIsInstalled(this.$store, mgmt.id),
          verifyUserCanInstallK3k(this.$store, mgmt.id),
          verifyUserCanCreateK3kClusters(this.$store, mgmt.id)
        ]);

        out.push({
          isVirtual:            !!pCluster.metadata?.annotations?.['ui.rancher/parent-cluster'],
          isLocal:              pCluster.name === 'local',
          isReady:              mgmt.isReady,
          label:                pCluster.displayName || pCluster.name || pCluster.id,
          value:                pCluster,
          k3kInstalled,
          canInstallK3k,
          canCreateK3kClusters,
        });
      }
      this.allParentClusterOptions = out;
      this.loadingClusters = false;
    },

    async verifyK3kIsInstalledInCurrentCluster(c) {
      try {
        const cluster = c || this.parentCluster;

        await cluster.waitForMgmt();

        const isInstalled = await verifyK3kIsInstalled(this.$store, cluster.mgmt.id);

        if (!isInstalled) {
          this.didInstallK3k = false;
        }
        this.$emit('update:k3kInstalled', isInstalled);
      } catch {
        // timed out trying to load mgmt cluster
        // the list of available clusters is filtered using a property on mgmt so we shouldn't hit this block
      }
    },

    async installK3k(cb) {
      // tell the parent component to remove any installation error messages from the error array
      this.$emit('error', false);

      const repo = {
        apiVersion: 'catalog.cattle.io/v1',
        kind:       'ClusterRepo',
        metadata:   { name: K3K_REPO_NAME },
        spec:       { url: K3K_REPO_URL, insecurePlainHttp:	false }
      };

      const cluster = this.parentCluster;

      const normanCluster = await cluster.findNormanCluster();

      await cluster.waitForMgmt();
      const mgmtCluster = cluster.mgmt;
      const k3kRepoUrl = `/k8s/clusters/${ mgmtCluster.id }/v1/catalog.cattle.io.ClusterRepo/${ K3K_REPO_NAME }`;
      let k3kRepo;

      try {
        // create k3k repo crd
        const repoYaml = saferDump(repo);

        await normanCluster.doAction('importYaml', { yaml: repoYaml });

        // wait for the repo to be downloaded
        let fetched = false;
        let tries = 0;

        let latestK3kChartVersion = '';

        while (!fetched) {
          k3kRepo = await this.$store.dispatch('management/request', {
            url:    k3kRepoUrl,
            method: 'GET',
          });
          const downloadedCondition = k3kRepo.status.conditions.find((s) => s.type === 'OCIDownloaded');

          const downloaded = downloadedCondition?.status === 'True';

          if (downloaded) {
            // get the latest version of the chart
            const indexUrl = k3kRepo?.links?.index;
            const repoReq = await this.$store.dispatch('management/request', {
              url:    `${ indexUrl }`,
              method: 'GET',
            });

            if (repoReq?.entries?.[K3K_CHART_NAME] && repoReq?.entries?.[K3K_CHART_NAME].length) {
              latestK3kChartVersion = (repoReq?.entries?.[K3K_CHART_NAME] || [])[0]?.version;
              console.log('Installing k3k version...', latestK3kChartVersion);
              fetched = true;
            } else {
              fetched = false;
            }
          }

          if (!fetched) {
            tries++;

            if (tries > DOWNLOAD_MAX_RETRIES) {
              throw new Error('Failed to add Helm Chart Repository');
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT));
          }
        }

        // install k3k chart
        const installRequest = {
          charts: [
            {
              annotations: {
                'catalog.cattle.io/ui-source-repo':      K3K_REPO_NAME,
                'catalog.cattle.io/ui-source-repo-type': 'cluster'
              },
              chartName:   K3K_CHART_NAME,
              releaseName: K3K_CHART_NAME,
              version:     latestK3kChartVersion || '1.0.0',
              values:      K3K_VALUES
            }
          ],
          disableOpenAPIValidation: false,
          namespace:                K3K_CHART_NAMESPACE,
          noHooks:                  false,
          skipCRDs:                 false,
          timeout:                  '600s',
          wait:                     true
        };

        let installTries = 0;
        const INSTALL_MAX_TRIES = 3;

        while (!this.didInstallK3k && installTries <= INSTALL_MAX_TRIES) {
          installTries++;
          try {
            const res = await this.$store.dispatch('management/request', {
              url:    `${ k3kRepoUrl }?action=install`,
              method: 'POST',
              data:   installRequest
            });

            if (res._status === 201) {
              this.$emit('update:k3kInstalled', true);

              this.didInstallK3k = true;
            }
          } catch (err) {
            if (installTries >= INSTALL_MAX_TRIES) {
              throw (err);
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT));
          }
        }

        if (this.didInstallK3k) {
          const currentOpt = this.allParentClusterOptions.find((opt) => opt.value.id === cluster.id);

          currentOpt.k3kInstalled = true;
          currentOpt.canCreateK3kClusters = true;
          cb(true);
        } else {
          cb(false);
        }
      } catch (e) {
        this.$emit('error', e);

        cb(false);
      }
    },
  },
};
</script>

<template>
  <div class="row mb-20">
    <div
      v-if="!showButtonOnly"
      class="col span-6"
    >
      <LabeledSelect
        v-model:value="selectedParentOption"
        label-key="k3k.hostCluster.label"
        :mode="mode"
        :disabled="!isCreate"
        :options="parentClusterOptions"
        :loading="loadingClusters"
      />
    </div>
    <div
      v-if="parentCluster && !isEmpty(parentCluster) && !k3kInstalled && isCreate"
      class="col span-6 centered text-label"
    >
      <t
        v-if="!showButtonOnly"
        raw
        k="k3k.hostCluster.notInstalled"
      />
      <AsyncButton
        type="button"
        class="btn-sm role-tertiary mt-5"
        mode="install"
        :action-label="t('k3k.hostCluster.installK3k')"
        @click="installK3k"
      />
    </div>
    <div
      v-else-if="parentCluster && !isEmpty(parentCluster) && didInstallK3k"
      class="col span-6 centered"
    >
      <span> <i class="icon icon-checkmark text-success mr-5" />{{ t('k3k.hostCluster.didInstall') }}</span>
    </div>
  </div>
</template>
