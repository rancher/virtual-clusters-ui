<script>
import { _CREATE } from '@shell/config/query-params';
import { LABELS } from '../../types';
import { Banner } from '@rancher/components';

export default {
  name: 'K3kProjectNSLabelStatus',

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

    namespacesDone: {
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
    showErrorBanner() {
      return !!(Object.values(this.statuses) || []).find((status) => {
        return status?.hasServerErrors;
      });
    },
  },

  methods: {
    computeNamespaceStatus(p = {}, nsSaved = []) {
      const namespaces = p.namespaces || [];
      const hasServerErrors = namespaces.filter((ns) => !!ns?.__policyServerError)?.length;
      /**
       * parent component adds label to ns then attempts to save: if the save attempt fails, the ns object will still contain the updated label
       * (or the parent component attempts to remove the label and saves)
       * so in order to determine that a ns really has been saved we also check for error properties applied by the parent component when it fails
       */
      const saved = namespaces.filter((ns) => {
        if (this.isInModal) {
          return this.namespacesDone.includes(ns.id);
        }
        const nsHasErrors = ns?.__policyServerError;

        return ns?.metadata?.labels?.[LABELS.POLICY] === this.policyName && !nsHasErrors;
      });

      const showSuccessIcon = !hasServerErrors && namespaces.length === saved.length;
      const showDeselectIcon = this.deselectedProjects.find((deselectedProject) => deselectedProject.id === p.id);
      let errMsg;

      if (hasServerErrors || (namespaces.length !== saved.length && (this.doneSavingNamespaces || !this.isInModal))) {
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
        v-if="showErrorBanner"
        color="error"
        :label="t('k3k.policy.projects.table.errorBannerInline')"
      />
      <table
        class="project-label-status"
        :class="{'in-modal': isInModal}"
      >
        <thead>
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
        </thead>
        <tbody>
          <tr
            v-for="({willSave, saved, errMsg, project, showDeselectIcon, showSuccessIcon}) of statuses"
            :key="project.id"
          >
            <td>
              <div>{{ project.nameDisplay }}</div>
              <span
                v-if="errMsg"
                class="project-err-msg"
              >{{ errMsg }}</span>
            </td>
            <td
              v-if="showDeselectIcon && isInModal"
              class="ns"
            >
              {{ willSave.length - saved.length }}/{{ willSave.length }}
            </td>
            <td
              v-else
              class="ns"
            >
              {{ saved.length }}/{{ willSave.length }}
            </td>

            <td class="status">
              <div>
                <i
                  v-if="showDeselectIcon"
                  v-clean-tooltip="doneSavingNamespaces && isInModal ? t('k3k.policy.projects.table.deselectedTooltipDone') : t('k3k.policy.projects.table.deselectedTooltip')"
                  class="icon icon-trash"
                  :class="{'text-error':!isInModal || doneSavingNamespaces, 'text-muted': isInModal && !doneSavingNamespaces}"
                />
                <i
                  v-else-if="errMsg"
                  v-clean-tooltip="t('k3k.policy.projects.table.errorTooltip')"
                  class="icon icon-error text-error"
                />
                <i
                  v-else-if="showSuccessIcon"
                  v-clean-tooltip="t('k3k.policy.projects.table.selectedTooltipDone')"
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
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.project-label-status {
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

.project-err-msg {
  color: var(--error-text);
}
</style>
