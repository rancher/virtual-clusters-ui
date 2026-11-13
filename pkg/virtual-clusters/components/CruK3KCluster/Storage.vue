<script>
import { mapGetters } from 'vuex';
import { _CREATE } from '@shell/config/query-params';
import { Banner } from '@components/Banner';
import { RcContentGroup } from '@components/Layout';
import RadioGroup from '@components/Form/Radio/RadioGroup.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { STORAGE } from '@shell/config/labels-annotations';
import UnitInput from '@shell/components/form/UnitInput';

const PERSISTENCE_TYPES = {
  DYNAMIC:   'dynamic',
  EPHEMERAL: 'ephemeral'
};

// TODO nb review
// select value for an unset storageClassName: k3k then creates the pvc with no class, and the host cluster default applies
// storage class names are dns-1123 subdomains and cannot contain '_'
const HOST_DEFAULT = '_host-default_';

export default {
  name: 'K3KStorage',

  emits: ['update:storageClassName', 'update:persistenceType', 'update:storageRequestSize'],

  components: {
    Banner,
    LabeledSelect,
    RadioGroup,
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
      // TODO nb review
      // immediate: the host cluster can be set before this component mounts, eg on edit
      handler(neu, old) {
        if (!neu?.id || neu.id === old?.id) {
          return;
        }

        // TODO nb review
        // storage class names belong to one host cluster
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

    persistenceTypeOptions() {
      return Object.values(PERSISTENCE_TYPES).map((type) => ({
        value:       type,
        label:       this.t(`k3k.storage.persistenceType.${ type }.label`),
        description: this.t(`k3k.storage.persistenceType.${ type }.description`)
      }));
    },

    defaultStorageClass() {
      return this.storageClasses.find((sc) => sc?.metadata?.annotations?.[STORAGE.DEFAULT_STORAGE_CLASS] === 'true');
    },

    storageClassOptions() {
      const hostDefaultLabel = this.defaultStorageClass ? this.t('k3k.storage.storageClass.hostDefaultNamed', { name: this.defaultStorageClass.metadata.name }) : this.t('k3k.storage.storageClass.hostDefault');

      return [
        { label: hostDefaultLabel, value: HOST_DEFAULT },
        ...this.storageClasses.map((sc) => ({ label: sc.metadata.name, value: sc.metadata.name }))
      ];
    },

    selectedStorageClass() {
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

    updatePersistenceType(type) {
      this.$emit('update:persistenceType', type);

      // TODO nb review
      // k3k reads storageClassName only in dynamic mode
      if (type === PERSISTENCE_TYPES.EPHEMERAL) {
        this.$emit('update:storageClassName', undefined);
      }
    },

    updateStorageClass(e) {
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
        k="k3k.storage.persistenceType.description"
      />
      <RadioGroup
        class="mmt-1"
        name="k3k-persistence-type"
        data-testid="k3k-persistence-type"
        :aria-label="t('k3k.storage.persistenceType.label')"
        :options="persistenceTypeOptions"
        :value="persistenceType"
        :mode="mode"
        use-body-text-color
        @update:value="updatePersistenceType"
      />
    </div>
    <div v-if="isDynamic">
      <t
        class="text-deemphasized"
        raw
        k="k3k.storage.storageClass.description"
      />
      <div class="k3k-input-row mmt-1">
        <LabeledSelect
          class="k3k-half"
          data-testid="k3k-storage-class-select"
          :disabled="!storageClasses.length"
          :value="selectedStorageClass"
          :loading="loadingStorageClasses"
          :mode="mode"
          label-key="k3k.storage.storageClass.label"
          :options="storageClassOptions"
          @update:value="updateStorageClass"
        />
        <UnitInput
          :increment="1024"
          :input-exponent="3"
          output-modifier
          :value="storageRequestSize || ''"
          :mode="mode"
          class="k3k-half"
          data-testid="k3k-storage-request-size"
          label-key="k3k.storage.storageRequestSize.label"
          @update:value="$emit('update:storageRequestSize', $event)"
        />
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
