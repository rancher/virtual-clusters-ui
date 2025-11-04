<script>
import ResourceTable from '@shell/components/ResourceTable';
import ResourceFetch from '@shell/mixins/resource-fetch';
import Masthead from '@shell/components/ResourceList/Masthead';
import { isRancherPrime } from '@shell/config/version';

export default {
  name: 'K3KPolicyList',

  components: { ResourceTable, Masthead },

  mixins: [ResourceFetch],

  props: {
    rows: {
      type:    Array,
      default: () => []
    },
    useQueryParamsForSimpleFiltering: {
      type:    Boolean,
      default: false
    },
    incrementalLoadingIndicator: {
      type:    Boolean,
      default: false
    }
  },

  data() {
    const getters = this.$store.getters;
    const params = { ...this.$route.params };
    const resource = params.resource;

    const inStore = getters['currentStore'](resource);
    const schema = getters[`${ inStore }/schemaFor`](resource);

    return {
      schema,
      resource,
      loadResources:                    [resource],
      isRancherPrime:                   isRancherPrime()
    };
  },

  computed: {
    headers() {
      return this.$store.getters['type-map/headersFor'](this.schema, this.canPaginate);
    },

    groupBy() {
      return this.$store.getters['type-map/groupByFor'](this.schema);
    },
  },

  watch: {
    /**
     * When a pagination is required and the user changes page / sort / filter, kick off a new set of API requests
     */
    pagination(neu, old) {
      if (neu && !this.paginationEqual(neu, old)) {
        this.$fetchType(this.resource);
      }
    },

    /**
     * Monitor the rows to ensure deleting the last entry in a server-side paginated page doesn't
     * result in an empty page
     */
    rows(neu) {
      if (!this.pagination) {
        return;
      }

      if (this.pagination.page > 1 && neu.length === 0) {
        this.setPagination({
          ...this.pagination,
          page: this.pagination.page - 1
        });
      }
    },
  },
};
</script>

<template>
  <div class="outlet">
    <Masthead
      :schema="schema"
      :resource="resource"
      :is-creatable="isRancherPrime"
      :show-incremental-loading-indicator="incrementalLoadingIndicator"
      :load-resources="loadResources"
      :load-indeterminate="false"
    />

    <ResourceTable
      :schema="schema"
      :rows="rows"
      :alt-loading="canPaginate && !isFirstLoad"
      :loading="loading"
      :use-query-params-for-simple-filtering="useQueryParamsForSimpleFiltering"
      :force-update-live-and-delayed="forceUpdateLiveAndDelayed"
      :external-pagination-enabled="canPaginate"
      :external-pagination-result="paginationResult"
      @pagination-changed="paginationChanged"
    />
  </div>
</template>

<style lang="scss" scoped>
    .header {
      position: relative;
    }
    H2 {
      position: relative;
      margin: 0 0 20px 0;
    }
    .filter{
      line-height: 45px;
    }
    .right-action {
      position: absolute;
      top: 10px;
      right: 10px;
    }
</style>
