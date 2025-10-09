<script>
import { _CREATE, _VIEW } from '@shell/config/query-params';
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
    }

  },

  components: { Banner },

  created() {
    this.displayProjects.forEach((p) => this.computeNamespaceStatus(p));
  },

  watch: {
    displayProjects(neu) {
      this.statuses = {};
      neu.forEach((p) => this.computeNamespaceStatus(p));
    },

    deselectedProjects(neu) {
      this.displayProjects.forEach((p) => this.computeNamespaceStatus(p));
    }
  },

  data() {
    return {
      statuses: {},
      isSaving: false,
    };
  },

  computed: {
    isView() {
      return this.mode === _VIEW;
    },

    showErrorBanner() {
      return !!(Object.values(this.statuses) || []).find((status) => {
        return status?.hasServerErrors || status?.hasPermissionErrors;
      });
    },

    // TODO nb only use in modal
    showSuccessBanner() {
      return false;
      // return !(Object.values(this.statuses) || []).find((status) => {
      //   return status?.willSave?.length !== status?.saved?.length;
      // });
    },
  },

  methods: {
    computeNamespaceStatus(p = {}) {
      const namespaces = p.namespaces;
      const hasServerErrors = namespaces.filter((ns) => !!ns?.__policyServerError)?.length;
      const hasPermissionErrors = namespaces.filter((ns) => !!ns?.__policyPermissionError)?.length;
      const shouldHaveAnnotation = !this.deselectedProjects.find((deselectedProject) => deselectedProject.id === p.id);

      /**
       * parent component adds annotation to ns then attempts to save: if the save attempt fails, the ns object will still contain the updated annotation
       * (or the parent component attempts to remove the annotation and saves)
       * so in order to determine that a ns really has been saved we also check for error properties applied by the parent component when it fails
       */
      const saved = namespaces.filter((ns) => {
        const nsHasErrors = ns?.__policyPermissionError || ns?.__policyServerError;

        return ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policyName && !nsHasErrors;
      });

      this.statuses[p.id] = {
        project:             p,
        willSave:            namespaces,
        saved,
        hasServerErrors,
        hasPermissionErrors,
        shouldHaveAnnotation
      };
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
          v-for="({willSave, saved, hasPermissionErrors, hasServerErrors, project, shouldHaveAnnotation}) of statuses"
          :key="project.id"
        >
          <td>
            <div>{{ project.nameDisplay }}</div>
            <span
              v-if="hasPermissionErrors"
              class="text-error"
            >{{ t('k3k.policy.projects.table.errors.permission') }}</span>
            <span
              v-if="hasServerErrors || willSave.length !== saved.length"
              class="text-error"
            >{{ t('k3k.policy.projects.table.errors.server') }}</span>
          </td>
          <td class="ns">
            {{ saved.length }}/{{ willSave.length }}
          </td>
          <td class="status">
            <!-- TODO nb icon for new projects to be saved?-->

            <div>
              <i
                v-if="!shouldHaveAnnotation"
                v-clean-tooltip="t('k3k.policy.projects.table.deselectedTooltip')"
                class="icon icon-trash text-error"
              />
              <i
                v-else-if="!hasPermissionErrors && !hasServerErrors && willSave.length === saved.length"
                class="icon icon-checkmark text-success"
              />
              <i
                v-else
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
