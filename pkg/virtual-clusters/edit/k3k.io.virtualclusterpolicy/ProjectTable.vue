<script>
import { _CREATE, _VIEW } from '@shell/config/query-params';
import { ANNOTATIONS } from '../../types';
import AsyncButton from '@shell/components/AsyncButton';
import { Banner } from '@rancher/components';

export default {
  name: 'K3kProjectNSAnnotationStatus',

  emits: ['retryProject', 'update:selectedProjects'],

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    selectedProjects: {
      type:    Array,
      default: () => []
    },

    policyName: {
      type:    String,
      default: ''
    },

  },

  components: { AsyncButton, Banner },

  created() {
    this.selectedProjects.forEach((p) => this.computeNamespaceStatus(p));
  },

  watch: {
    selectedProjects(neu) {
      this.statuses = {};
      neu.forEach((p) => this.computeNamespaceStatus(p));
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

    showSuccessBanner() {
      return !(Object.values(this.statuses) || []).find((status) => {
        return status?.willSave?.length !== status?.saved?.length;
      });
    },

    // if there are neither errors reported nor does it appear that all ns in all selected projects have been saved a couple things may have happened:
    // 1. there were errors saving the namespaces but the user has refreshed the page and we lost which sort of error
    // 2. Namespaces were added to the project from outside the UI after the policy was created
    showMaybeErrorBanner() {
      return !this.showErrorBanner && !this.showSuccessBanner;
    }
  },

  methods: {
    computeNamespaceStatus(p = {}) {
      const namespaces = p.namespaces;
      const hasServerErrors = namespaces.filter((ns) => !!ns?.__policyServerError)?.length;
      const hasPermissionErrors = namespaces.filter((ns) => !!ns?.__policyPermissionError)?.length;
      /**
       * parent component adds annotation to ns then attempts to save: if the save attempt fails, the ns object will still contain the updated annotation
       * so in order to determine that a ns really has been saved we also check for error properties applied by the parent component when it fails
       */
      const saved = namespaces.filter((ns) => ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] && ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policyName && !ns?.__policyPermissionError && !ns?.__policyServerError );

      this.statuses[p.id] = {
        project:             p,
        willSave:            namespaces,
        saved,
        hasServerErrors,
        hasPermissionErrors
      };
    },

    async updateNsStatus(namespace = {}) {
      const project = namespace.project;

      if (!project) {
        return;
      }
      this.computeNamespaceStatus(project);
    },

    retryProject(project, btnCb) {
      return this.$emit('retryProject', project, this.updateNsStatus, btnCb);
    },

    deselectProject(project) {
      const out = this.selectedProjects.filter((p) => p.id !== project.id);

      this.$emit('update:selectedProjects', out);
    }
  },

};
</script>

<template>
  <div class="row mb-20">
    <div class="col span-12">
      <Banner
        v-if="showErrorBanner"
        color="error"
        :label="t('k3k.policy.projects.table.errorBanner')"
      />
      <Banner
        v-if="showSuccessBanner"
        color="success"
        :label="t('k3k.policy.projects.table.successBanner')"
      />
      <Banner
        v-if="showMaybeErrorBanner"
        color="warning"
        :label="t('k3k.policy.projects.table.maybeErrorBanner')"
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
          v-for="({willSave, saved, hasPermissionErrors, hasServerErrors, project}) of statuses"
          :key="project.id"
        >
          <td>
            <div>{{ project.nameDisplay }}</div>
            <span
              v-if="hasPermissionErrors"
              class="text-error"
            >{{ t('k3k.policy.projects.table.errors.permission') }}</span>
            <span
              v-if="hasServerErrors"
              class="text-error"
            >{{ t('k3k.policy.projects.table.errors.server') }}</span>
          </td>
          <td class="ns">
            {{ saved.length }}/{{ willSave.length }}
          </td>
          <td class="status">
            <div>
              <i
                v-if="isSaving"
                class="icon icon-spinner icon-spin"
              />
              <i
                v-if="!hasPermissionErrors && !hasServerErrors && willSave.length === saved.length"
                class="icon icon-checkmark text-success"
              />
              <!-- TODO nb grey out form save button when this button is shown in any row -->

              <AsyncButton
                v-if="hasServerErrors || (!hasPermissionErrors && willSave.length !== saved.length) && !isView"
                mode="tryAgain"
                class="btn btn-sm role-tertiary"
                @click="btnCb=>retryProject(project, btnCb)"
              >
                <icon class="icon icon-sm icon-refresh" />
                {{ t('k3k.policy.projects.table.tryAgain') }}
              </AsyncButton>
              <button
                v-if="hasPermissionErrors && !hasServerErrors && !isView"
                class="btn btn-sm role-tertiary"
                @click="e=>deselectProject(project)"
              >
                <icon class="icon icon-sm icon-x" />
                {{ t('k3k.policy.projects.table.deselect') }}
              </button>
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
