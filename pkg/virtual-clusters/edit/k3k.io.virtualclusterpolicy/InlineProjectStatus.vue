<script>
import { _CREATE } from '@shell/config/query-params';
import { ANNOTATIONS } from '../../types';
import { Banner } from '@rancher/components';

export default {
  name: 'K3kProjectNSAnnotationStatus',

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    selectedProjects: {
      type:    Array,
      default: () => []
    },

    deselectedProjects: {
      type:    Array,
      default: () => []
    },

    displayProjects: {
      type:    Array,
      default: () => []
    },

    policyName: {
      type:    String,
      default: ''
    },

    isInModal: {
      type:    Boolean,
      default: false
    },

    namespacesSaved: {
      type:    Array,
      default: () => []
    },

    doneSavingNamespaces: {
      type:    Boolean,
      default: false
    },
  },

  components: { Banner },

  created() {
    this.computeAllStatuses();
  },

  watch: {
    displayProjects() {
      if (!this.isInModal) {
        this.statuses = {};
        this.computeAllStatuses();
      }
    },

    deselectedProjects() {
      if (!this.isInModal) {
        this.computeAllStatuses();
      }
    }
  },

  data() {
    return { statuses: {} };
  },

  computed: {
    // TODO nb success banner in modal
    showErrorBanner() {
      return !!(Object.values(this.statuses) || []).find((status) => {
        return status?.hasServerErrors || status?.hasPermissionErrors;
      });
    },
  },

  methods: {
    computeNamespaceStatus(p = {}, nsSaved = []) {
      const namespaces = p.namespaces || [];
      const hasServerErrors = namespaces.filter((ns) => !!ns?.__policyServerError)?.length;
      const hasPermissionErrors = namespaces.filter((ns) => !!ns?.__policyPermissionError)?.length;
      /**
       * parent component adds annotation to ns then attempts to save: if the save attempt fails, the ns object will still contain the updated annotation
       * (or the parent component attempts to remove the annotation and saves)
       * so in order to determine that a ns really has been saved we also check for error properties applied by the parent component when it fails
       */
      const saved = namespaces.filter((ns) => {
        // nsSaved will be passed in when the namespace-saving function calls this update function
        if (this.isInModal) {
          return this.namespacesSaved.includes(ns.id);
        }
        const nsHasErrors = ns?.__policyPermissionError || ns?.__policyServerError;

        return ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policyName && !nsHasErrors;
      });

      const showSuccessIcon = !hasPermissionErrors && !hasServerErrors && namespaces.length === saved.length;
      const showDeselectIcon = this.deselectedProjects.find((deselectedProject) => deselectedProject.id === p.id);
      let errMsg;

      if (hasPermissionErrors) {
        errMsg = this.t('k3k.policy.projects.table.errors.permission');
      } else if (hasServerErrors || (namespaces.length !== saved.length && (this.doneSavingNamespaces || !this.isInModal))) {
        errMsg = this.t('k3k.policy.projects.table.errors.server');
      }

      this.statuses[p.id] = {
        project:             p,
        willSave:            namespaces,
        saved,
        showDeselectIcon,
        showSuccessIcon,
        errMsg,
      };
    },

    computeAllStatuses() {
      this.displayProjects.forEach((p) => this.computeNamespaceStatus(p));
    },
  },

};
</script>

<template>
  <div class="row mb-20">
    <div class="col span-12">
      <Banner
        v-if="showSuccessBanner"
        color="success"
        :label="t('k3k.policy.projects.table.successBanner')"
      />
      <Banner
        v-else-if="showErrorBanner"
        color="error"
        :label="t('k3k.policy.projects.table.errorBanner')"
      />
      <table
        class="project-annotation-status"
      >
        <tr>
          <th>
            {{ t('k3k.policy.projects.table.projects') }}
          </th>
          <th class="ns">
            {{ t('k3k.policy.projects.table.namespaces') }}
          </th>
          <th class="status">
            {{ t('k3k.policy.projects.table.status') }}
          </th>
        </tr>
        <tr
          v-for="({willSave, saved, errMsg, project, showDeselectIcon, showSuccessIcon}) of statuses"
          :key="project.id"
        >
          <td>
            <div>{{ project.nameDisplay }}</div>
            <span
              v-if="errMsg"
              class="text-error"
            >{{ errMsg }}</span>
          </td>
          <td class="ns">
            {{ saved.length }}/{{ willSave.length }}
          </td>
          <td class="status">
            <div>
              <i
                v-if="errMsg"
                v-clean-tooltip="t('k3k.policy.projects.table.errorTooltip')"
                class="icon icon-error text-error"
              />
              <i
                v-else-if="showDeselectIcon"
                v-clean-tooltip="t('k3k.policy.projects.table.deselectedTooltip')"
                class="icon icon-trash text-error"
                :class="{'text-error':!inModal || doneSavingNamespaces, 'text-muted': inModal && !doneSavingNamespaces}"
              />
              <i
                v-else-if="showSuccessIcon"
                v-clean-tooltip="t('k3k.policy.projects.table.successTooltip')"
                class="icon icon-checkmark text-success"
              />
              <i
                v-else-if="isInModal && !doneSavingNamespaces"
                v-clean-tooltip="t('k3k.policy.projects.table.selectedTooltip')"
                class="icon icon-checkmark text-muted"
              />
              <i
                v-else-if="!isInModal"
                v-clean-tooltip="t('k3k.policy.projects.table.errorTooltip')"
                class="icon icon-refresh text-warning"
              />
            </div>
          </td>
        </tr>
      </table>
    </div>
  </div>
</template>

<style lang="scss" scoped>
    .project-annotation-status {
        width: 100%;
        border-collapse: separate;

        & th,td{
            text-align: left;
            padding: 5px;
        }

        & tr:not(:last-of-type) td{
            border-bottom: 1px dashed var(--border);
        }

        & td.ns {
            width: 12em;
        }

        & td.status {
          min-width: 35px;
        }
    }
</style>
