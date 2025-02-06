<script>
import { _CREATE } from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { saferDump } from '@shell/utils/create-yaml';
import AsyncButton from '@shell/components/AsyncButton';
import { addParams } from '@shell/utils/url';

const MAX_RETRIES = 10;
const RETRY_WAIT = 500;

export default {
  name: 'K3kHostCluster',

  emits: ['update:parentCluster'],

  components: { LabeledSelect, AsyncButton },

  props: {
    parentCluster: {
      type:    String,
      default: ''
    },

    normanCluster: {
      type:    Object,
      default: () => {}
    },

    mode: {
      type:    String,
      default: _CREATE
    },

    clusters: {
      type:    Array,
      default: () => []
    },

  },

  watch: {
    watch: {
      parentClusterOptions(neu) {
        if (!this.parentCluster && neu.length) {
          this.$emit('update:parentCluster', neu[0].value);
        }
      },

      // parentCluster(neu, old) {
      //   console.log('** parent cluster changed');
      //   if (neu && neu !== old) {
      //     this.checkForK3kInstall();
      //   }
      // }
    },
  },

  computed: {
    parentClusterOptions() {
      return this.clusters.reduce((opts, cluster) => {
        if (!cluster?.metadata?.annotations?.['ui.rancher/parent-cluster']) {
          opts.push({ label: cluster.name, value: cluster.id });
        }

        return opts;
      }, []);
    },
  },

  data() {
    return { k3kInstalled: false };
  },

  methods: {

    // parentClusterChanged(e) {
    //   this.$emit('update:parentCluster', e);
    //   this.checkForK3kInstall(e);
    // },

    // // TODO nb implement
    // async checkForK3kInstall(clusterid) {
    //   console.log('** check for existing k3k...');
    //   debugger;
    //   // TODO nb stop duplicating
    //   const cluster = this.clusters.find((c) => c.id === this.parentCluster);

    //   await cluster.waitForMgmt();
    //   const mgmtCluster = cluster.mgmt;

    //   try {
    //     const res = await this.$store.dispatch('management/request', {
    //       url:    `/k8s/clusters/${ mgmtCluster.id }/v1/namespaces/k3k-system`,
    //       method: 'GET',
    //     });

    //     this.k3kInstalled = true;
    //   } catch (e) {
    //     console.error(e);

    //     this.k3kInstalled = false;
    //   }
    // },

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

      try {
        // create k3k repo crd
        const repoYaml = saferDump(repo);

        await normanCluster.doAction('importYaml', { yaml: repoYaml });

        // wait for the repo to be downloaded
        let fetched = false;
        let tries = 0;

        while (!fetched) {
          console.log('*** checking k3k repo...');
          const k3kRepo = await this.$store.dispatch('management/request', {
            url:    k3kRepoUrl,
            method: 'GET',
          });
          const downloadedCondition = k3kRepo.status.conditions.find((s) => s.type === 'Downloaded');

          fetched = downloadedCondition?.status === 'True';
          console.log('*** repo fetched: ', fetched, k3kRepo);
          if (!fetched) {
            console.log('*** k3krepo not yet downloaded, retrying...', k3kRepo);
            tries++;

            if (tries > MAX_RETRIES) {
              throw new Error('Failed to add Helm Chart Repository');
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT));
          }

          fetched = true;
        }

        // cb(true);
      } catch (e) {
        this.$store.dispatch('growl/error', { title: 'Error installing k3k', message: e });

        cb(false);
      }

      // TODO nb get latest version instead of harcoding
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
            version:     '0.1.5-r1'
          }
        ],
        disableOpenAPIValidation: false,
        namespace:                'k3k-system',
        noHooks:                  false,
        skipCRDs:                 false,
        timeout:                  '600s',
        wait:                     true
      };

      try {
        const res = await this.$store.dispatch('management/request', {
          url:    `${ k3kRepoUrl }?action=install`,
          method: 'POST',
          data:   installRequest
        });

        if (res._status === 201) {
          this.k3kInstalled = true;
          cb(true);
        } else {
          console.log(res);
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
      class="col span-6 centered"
    >
      <AsyncButton
        type="button"
        class="btn-sm role-tertiary"
        mode="install"
        action-label="Install K3K"
        @click="installK3k"
      />
    </div>
    <div
      v-else-if="parentCluster"
      class="col span-6 centered"
    >
      <span> <i class="icon icon-checkmark" /> k3k installed</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .centered {
    display: flex;
    align-items: center;
  }
</style>
