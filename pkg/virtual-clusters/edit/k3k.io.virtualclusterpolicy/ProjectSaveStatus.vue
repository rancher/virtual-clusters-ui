<script>
export default {
  name: 'K3kProjectNSAnnotationStatus',

  props: {
    /* {
        [project id]: {
            willSave: [] namespaces to save
            saved: [] namespaces saved
            errors: [] namespace saving errors
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
    <div class="col span-10">
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
          <!-- empty col for try again button -->
        <!--   <th class="try-again" /> -->
        </tr>
        <tr
          v-for="({willSave, saved, errors}, projectId) of projectStatuses"
          :key="projectId"
        >
          <td>
            {{ projectId }}
          </td>
          <td class="ns">
            ({{ saved.length }}/{{ willSave.length }})
          </td>
          <td class="status">
            <i
              v-if="errors.length"
              class="icon icon-x text-error"
            />
            <i
              v-else-if="(saved||[]).length < (willSave||[]).length"
              class="icon icon-spinner icon-spin"
            />
            <i
              v-else
              class="icon icon-check text-success"
            />
          </td>
          <!--           <td class="try-again">
            <button
              v-if="errors.length"
              class="btn btn-sm role-secondary"
            >
              Try Again
            </button>
          </td> -->
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
            border-bottom: 1px dashed var(--border);
            text-align: left;
            padding-bottom: 5px;
        }

        & td.ns {
            width: 10em;
        }

        & td.status {
            width: 3em;
        }

        & td.try-again {
            width: 3em;
        }

    }
</style>
