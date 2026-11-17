<script>
import { mapGetters } from 'vuex';
import { _CREATE } from '@shell/config/query-params';
import { Banner } from '@components/Banner';
import { RcContentGroup } from '@components/Layout';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { STORAGE } from '@shell/config/labels-annotations';
import UnitInput from '@shell/components/form/UnitInput';

const PERSISTENCE_TYPES = {
  DYNAMIC:   'dynamic',
  EPHEMERAL: 'ephemeral'
};

// labeledselect value used to unset a storage class name in the spec, in which case k3k uses the host cluster default
const HOST_DEFAULT = '_host-default_';

//
// labeledselect value for ephemeral persistence, which uses no storage class
const EPHEMERAL = '_ephemeral_';

export default {
  name: 'K3KStorage',

  emits: ['update:storageClassName', 'update:persistenceType', 'update:storageRequestSize'],

  components: {
    Banner,
    LabeledSelect,
    RcContentGroup,
    UnitInput
  },

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    storageClassName: {
      type:    String,
      default: null
    },

    persistenceType: {
      type:    String,
      default: PERSISTENCE_TYPES.DYNAMIC
    },

    storageRequestSize: {
      type:    String,
      default: ''
    },

    // provisioning cluster
    parentCluster: {
      type:    Object,
      default: null
    }
  },

  watch: {
    parentCluster: {

      handler(neu, old) {
        if (!neu?.id || neu.id === old?.id) {
          return;
        }

        // clear out the storage class selection when switching host clusters
        if (old?.id) {
          this.$emit('update:storageClassName', undefined);
        }

        this.fetchStorageClasses();
      },
      immediate: true
    }
  },

  data() {
    return {
      storageClassErrors:    [],
      loadingStorageClasses: false,
      storageClassesLoaded:  false,
      storageClasses:        []
    };
  },

  computed: {
    ...mapGetters({ t: 'i18n/t' }),

    isDynamic() {
      return this.persistenceType === PERSISTENCE_TYPES.DYNAMIC;
    },

    defaultStorageClass() {
      return this.storageClasses.find((sc) => sc?.metadata?.annotations?.[STORAGE.DEFAULT_STORAGE_CLASS] === 'true');
    },

    storageClassOptions() {
      const hostDefaultLabel = this.defaultStorageClass ? this.t('k3k.storage.storageClass.hostDefaultNamed', { name: this.defaultStorageClass.metadata.name }) : this.t('k3k.storage.storageClass.hostDefault');

      return [
        { label: hostDefaultLabel, value: HOST_DEFAULT },
        { label: this.t('k3k.storage.storageClass.ephemeral'), value: EPHEMERAL },
        ...this.storageClasses.map((sc) => ({ label: sc.metadata.name, value: sc.metadata.name }))
      ];
    },

    selectedStorageClass() {
      if (!this.isDynamic) {
        return EPHEMERAL;
      }

      return this.storageClassName || HOST_DEFAULT;
    },

    showNoDefaultWarning() {
      return this.isDynamic && !this.storageClassName && this.storageClassesLoaded && !this.defaultStorageClass;
    }
  },

  methods: {
    async fetchStorageClasses() {
      const hostId = this.parentCluster.id;
      const clusterName = this.parentCluster.displayName || this.parentCluster.name;

      this.loadingStorageClasses = true;
      this.storageClassesLoaded = false;
      this.storageClassErrors = [];
      this.storageClasses = [];

      try {
        await this.parentCluster.waitForMgmt();

        const mgmtCluster = this.parentCluster.mgmt;

        const scSchema = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ mgmtCluster.id }/v1/schemas/storage.k8s.io.storageclass`,
          method: 'GET',
        });

        if (this.parentCluster?.id !== hostId) {
          return;
        }

        if (!scSchema) {
          this.storageClassErrors.push(this.t('k3k.errors.loadingStorageClasses', { cluster: clusterName }) + this.t('k3k.errors.storageClassSchema'));

          return;
        }

        const res = await this.$store.dispatch('management/request', {
          url:    `/k8s/clusters/${ mgmtCluster.id }/v1/storage.k8s.io.storageclasses`,
          method: 'GET',
        });

        if (this.parentCluster?.id !== hostId) {
          return;
        }

        this.storageClasses = res?.data || [];
        this.storageClassesLoaded = true;
      } catch (err) {
        if (this.parentCluster?.id === hostId) {
          this.storageClassErrors.push(this.t('k3k.errors.loadingStorageClasses', { cluster: clusterName }) + (err?.data || err));
        }
      } finally {
        if (this.parentCluster?.id === hostId) {
          this.loadingStorageClasses = false;
        }
      }
    },

    updateStorageClass(e) {
      //
      // k3k reads storageClassName only in dynamic mode
      if (e === EPHEMERAL) {
        this.$emit('update:persistenceType', PERSISTENCE_TYPES.EPHEMERAL);
        this.$emit('update:storageClassName', undefined);

        return;
      }

      this.$emit('update:persistenceType', PERSISTENCE_TYPES.DYNAMIC);
      this.$emit('update:storageClassName', e === HOST_DEFAULT ? undefined : e);
    }
  }

};
</script>

<template>
  <RcContentGroup>
    <Banner
      v-if="storageClassErrors.length"
      color="error"
      :label="storageClassErrors.join('. ')"
    />
    <div>
      <t
        class="text-deemphasized"
        raw
        k="k3k.storage.storageClass.description"
      />
      <div class="k3k-input-row mmt-1">
        <LabeledSelect
          class="k3k-half"
          data-testid="k3k-storage-class-select"
          :value="selectedStorageClass"
          :loading="loadingStorageClasses"
          :mode="mode"
          label-key="k3k.storage.storageClass.label"
          :options="storageClassOptions"
          @update:value="updateStorageClass"
        />
        <div
          v-if="isDynamic"
          class="k3k-half"
          data-testid="k3k-storage-request-size"
        >
          <UnitInput
            :increment="1024"
            :input-exponent="3"
            output-modifier
            :value="storageRequestSize || ''"
            :mode="mode"
            label-key="k3k.storage.storageRequestSize.label"
            @update:value="$emit('update:storageRequestSize', $event)"
          />
        </div>
      </div>
    </div>
    <Banner
      v-if="showNoDefaultWarning"
      color="warning"
      data-testid="k3k-storage-no-default-banner"
      :label="t('k3k.storage.storageClass.noDefault')"
    />
  </RcContentGroup>
</template>
