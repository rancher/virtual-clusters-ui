<script>
export default {
  name: 'K3kProjectNSAnnotationStatus',

  emits: ['retryProject'],

  props: {
    /* {
        [project id]: {
            willSave: [] namespaces to save
            saved: [] namespaces saved
            serverError: bool error saving some ns but user should be given the chance to try again
            permissionError: bool error saving ns and user shouldn't be given option to try again
        }
    } */
    projectStatuses: {
      type:    Object,
      default: () => { }
    }
  },

};
</script>

<template>
  <div class="row mb-20">
    <div class="col span-12">
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
          v-for="({willSave, saved, permissionError, serverError}, projectId) of projectStatuses"
          :key="projectId"
        >
          <td>
            <div>{{ projectId }}</div>
            <span
              v-if="permissionError"
              class="text-error"
            >{{ t('k3k.policy.projects.table.errors.permission') }}</span>
            <span
              v-if="serverError"
              class="text-error"
            >{{ t('k3k.policy.projects.table.errors.server') }}</span>
          </td>
          <td class="ns">
            ({{ saved.length }}/{{ willSave.length }})
          </td>
          <td class="status">
            <div>
              <i
                v-if="permissionError"
                class="icon icon-error text-error"
              />
              <i
                v-else-if="(saved||[]).length < (willSave||[]).length"
                class="icon icon-spinner icon-spin"
              />
              <i
                v-else-if="!permissionError && !serverError"
                class="icon icon-checkmark text-success"
              />
              <button
                v-if="serverError"
                class="btn btn-sm role-tertiary"
                @click="$emit('retryProject', projectId)"
              >
                <icon class="icon icon-sm icon-refresh" />
                {{ t('k3k.policy.projects.table.tryAgain') }}
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

        & td.status button .icon {
          padding-right: 3px;
        }

    }
</style>
