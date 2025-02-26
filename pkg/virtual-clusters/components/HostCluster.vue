<script>
import { _CREATE } from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { saferDump } from '@shell/utils/create-yaml';
import AsyncButton from '@shell/components/AsyncButton';
import { sortBy } from '@shell/utils/sort';

const DOWNLOAD_MAX_RETRIES = 10;
const RETRY_WAIT = 1000;

export default {
  name: 'K3kHostCluster',

  emits: ['update:parentCluster'],

  components: { LabeledSelect, AsyncButton },

  props: {
    // parent cluster's prov cluster id
    parentCluster: {
      type:    String,
      default: ''
    },

    // parent cluster's norman cluster object
    normanCluster: {
      type:    Object,
      default: () => {}
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

  },

  watch: {
    parentClusterOptions: {
      handler(neu = []) {
        if (!this.parentCluster && neu.length) {
          this.$emit('update:parentCluster', neu[0].value);
        }
      },
      immediate: true
    },

    parentCluster: {
      handler(neu) {
        if (neu && this.mode === _CREATE) {
          this.verifyK3kIsInstalled();
        }
      },
      immediate: true
    },
  },

  computed: {
    parentClusterOptions() {
      const out = this.clusters.reduce((opts, cluster) => {
        if (!cluster?.metadata?.annotations?.['ui.rancher/parent-cluster']) {
          opts.push({ label: cluster.displayName || cluster.name, value: cluster.id });
        }

        return opts;
      }, []);

      return sortBy(out, 'label');
    },
  },

  data() {
    // track if k3k chart is present in the currently selected host cluster AND
    // track if the user installed k3k while viewing this page
    return { k3kInstalled: true, didInstallK3k: false };
  },

  methods: {
    // check if the currently-selected cluster has the k3k chart's namespace and assume k3k is running if it does
    async verifyK3kIsInstalled() {
      try {
        const cluster = this.clusters.find((c) => c.id === this.parentCluster);

        await cluster.waitForMgmt();
        const mgmtCluster = cluster.mgmt;

        await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ mgmtCluster.id }/v1/namespaces/k3k-system`,
          method: 'GET',
        });

        this.k3kInstalled = true;
      } catch (err) {
        this.didInstallK3k = false;
        this.k3kInstalled = false;
      }
    },

    async installK3k(cb) {
      const repo = {
        apiVersion: 'catalog.cattle.io/v1',
        kind:       'ClusterRepo',
        metadata:   { name: 'k3k' },
        spec:       {
          gitBranch: 'main',
          gitRepo:   'https://github.com/rancher/k3k.git'
        }
      };

      const cluster = this.clusters.find((c) => c.id === this.parentCluster);
      const normanCluster = await cluster.findNormanCluster();

      await cluster.waitForMgmt();
      const mgmtCluster = cluster.mgmt;
      const k3kRepoUrl = `/k8s/clusters/${ mgmtCluster.id }/v1/catalog.cattle.io.ClusterRepo/k3k`;
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
          const downloadedCondition = k3kRepo.status.conditions.find((s) => s.type === 'Downloaded');

          const downloaded = downloadedCondition?.status === 'True';

          if (downloaded) {
            // get the latest version of the chart
            const indexUrl = k3kRepo?.links?.index;
            const repoReq = await this.$store.dispatch('management/request', {
              url:    `${ indexUrl }`,
              method: 'GET',
            });

            if (repoReq?.entries?.k3k && repoReq?.entries?.k3k.length) {
              latestK3kChartVersion = (repoReq?.entries?.k3k || [])[0]?.version;
              console.log('Installing k3k version...', latestK3kChartVersion);
              fetched = true;
            } else {
              fetched = false;
            }
          }

          if (!fetched) {
            console.log('*** k3krepo not yet downloaded, retrying...', k3kRepo);
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
                'catalog.cattle.io/ui-source-repo':      'k3k',
                'catalog.cattle.io/ui-source-repo-type': 'cluster'
              },
              chartName:   'k3k',
              releaseName: 'k3k',
              version:     latestK3kChartVersion || '0.1.5-r1'
            }
          ],
          disableOpenAPIValidation: false,
          namespace:                'k3k-system',
          noHooks:                  false,
          skipCRDs:                 false,
          timeout:                  '600s',
          wait:                     true
        };

        let installTries = 0;
        const INSTALL_MAX_TRIES = 3;

        while (!this.k3kInstalled || installTries <= INSTALL_MAX_TRIES) {
          installTries++;
          try {
            const res = await this.$store.dispatch('management/request', {
              url:    `${ k3kRepoUrl }?action=install`,
              method: 'POST',
              data:   installRequest
            });

            if (res._status === 201) {
              this.k3kInstalled = true;
              this.didInstallK3k = true;
            }
          } catch (err) {
            if (installTries >= INSTALL_MAX_TRIES) {
              throw (err);
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT));
          }
        }

        if (this.k3kInstalled) {
          cb(true);
        } else {
          cb(false);
        }
      } catch (e) {
        this.$store.dispatch('growl/error', { title: 'Error installing k3k', message: e });

        cb(false);
      }
    },
  },
};
</script>

<template>
  <div class="row mb-20">
    <div class="col span-6">
      <LabeledSelect
        label="Host Cluster"
        :mode="mode"
        :options="parentClusterOptions"
        :value="parentCluster"
        @selecting="$emit('update:parentCluster', $event)"
      />
    </div>
    <div
      v-if="parentCluster && !k3kInstalled"
      class="col span-6 centered text-muted"
    >
      <t
        raw
        k="k3k.hostCluster.notInstalled"
      />
      <AsyncButton
        type="button"
        class="btn-sm role-tertiary mt-5"
        mode="install"
        action-label="Install K3K"
        @click="installK3k"
      />
    </div>
    <div
      v-else-if="parentCluster && didInstallK3k"
      class="col span-6 centered"
    >
      <span> <i class="icon icon-checkmark text-success mr-5" /> k3k installed</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .centered {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
  }
</style>
