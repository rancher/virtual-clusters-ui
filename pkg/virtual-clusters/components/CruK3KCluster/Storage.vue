<script>
import { mapGetters } from 'vuex';
import { _CREATE } from '@shell/config/query-params';
import { STORAGE_CLASS } from '@shell/config/types';
import { Banner } from '@components/Banner';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { STORAGE } from '@shell/config/labels-annotations';

export default {
  name: 'K3KStorage',

  emits: ['update:storageClassName'],

  components: { Banner, LabeledSelect },

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    storageClassName: {
      type:    String,
      default: null
    },

    // provisioning cluster
    parentCluster: {
      type:    Object,
      default: null
    }
  },

  watch: {
    parentCluster(neu) {
      if (neu) {
        this.$emit('update:storageClassName', undefined);
        this.fetchStorageClasses();
      }
    },

    defaultStorageClass(neu) {
      if (neu && !this.storageClassName) {
        this.$emit('update:storageClassName', neu.metadata.name);
      }
    }
  },

  data() {
    return {
      storageClassErrors: [], loadingStorageClasses: false, storageClasses: []
    };
  },

  computed: {
    ...mapGetters({ t: 'i18n/t' }),

    storageClassOptions() {
      const out = [this.t('k3k.storage.noneOption')];

      this.storageClasses.forEach((c) => {
        out.push(c.metadata.name);
      });

      return out;
    },

    defaultStorageClass() {
      return this.storageClasses.find((sc) => sc?.metadata?.annotations?.[STORAGE.DEFAULT_STORAGE_CLASS] === 'true');
    }
  },

  methods: {

    async fetchStorageClasses() {
      this.loadingStorageClasses = true;
      this.storageClassErrors = [];
      const clusterName = this.parentCluster.displayName || this.parentCluster.name;

      await this.parentCluster.waitForMgmt();

      const mgmtCluster = this.parentCluster.mgmt;

      try {
        const scSchema = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ mgmtCluster.id }/v1/schemas/storage.k8s.io.storageclass`,
          method: 'GET',
        });

        if (!scSchema) {
          this.storageClassErrors.push(this.t('k3k.errors.loadingStorageClasses', { cluster: clusterName }) + this.t('k3k.errors.storageClassSchema'));

          return;
        }

        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ mgmtCluster.id }/v1/storage.k8s.io.storageclasses`,
          method: 'GET',
        });

        this.storageClasses = res.data;
      } catch (err) {
        this.storageClassErrors.push(this.t('k3k.errors.loadingStorageClasses', { cluster: clusterName }) + err.data || err);
      }
      this.loadingStorageClasses = false;
    },

    updateStorageClass(e) {
      if (e === this.t('k3k.storage.noneOption')) {
        this.$emit('update:storageClassName', undefined);
      } else {
        this.$emit('update:storageClassName', e);
      }
    }
  }

};
</script>

<template>
  <div>
    <h4>{{ t('k3k.storage.title') }}</h4>
    <Banner
      v-if="storageClassErrors.length"
      color="error"
      :label="storageClassErrors.join('. ')"
    />
    <div class="row mb-20">
      <div class="col span-6">
        <LabeledSelect
          :disabled="storageClassOptions.length === 1"
          :value="storageClassName || t('k3k.storage.noneOption')"
          :loading="loadingStorageClasses"
          :mode="mode"
          label-key="k3k.storage.storageClass.label"
          :options="storageClassOptions"
          @selecting="updateStorageClass"
        />
      </div>
      <div class="col span-6">
        <t
          class="text-label centered"
          raw
          k="k3k.storage.storageClass.description"
        />
      </div>
    </div>
  </div>
</template>
