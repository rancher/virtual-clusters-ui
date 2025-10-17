<script>
import {
  _CREATE, _EDIT, _UNFLAG, AS, MODE
} from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { randomStr } from '@shell/utils/string';
import { sortBy } from '@shell/utils/sort';
import { MANAGEMENT } from '@shell/config/types';
import { NotificationLevel } from '@shell/types/notifications';
import AppModal from '@shell/components/AppModal.vue';
import ProgressBar from './ProgressBar.vue';
import { Banner } from '@rancher/components';

import { ANNOTATIONS, K3K } from '../../types';
import ProjectStatusTable from './ProjectStatusTable.vue';

import { mapGetters } from 'vuex';
import uniq from 'lodash/uniq';
import debounce from 'lodash/debounce';

// if the total number of namespaces being assigned and unassigned exceeds this number, the user will be forced to stay on the policy creation page
// and shown a progress modal
// otherwise they will be kicked back to the policy list view right away
// and errors/success will be reported through the notification center
const MODAL_SHOW_THRESHOLD = 200;

export default {
  name: 'K3kPolicyProjectSelect',

  emits: ['update:errors', 'update:projectAnnotation', 'update:selectedProjects', 'finish'],

  components: {
    LabeledSelect,
    ProjectStatusTable,
    AppModal,
    Banner,
    ProgressBar
  },

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    policy: {
      type:    Object,
      default: () => {}
    },

    errors: {
      type:    Array,
      default: () => []
    }

  },

  created() {
    if (this.mode !== _CREATE) {
      this.findSelectedProjects();
    }
    this.getProjectOptions();
    this.denouncedUpdateNotification = debounce(this.updateNotification, 500);
  },

  data() {
    return {
      projectOptions:              [],
      showModal:                   false,
      doneSavingNamespaces:        false,
      hasErrors:                   false,
      namespacesDone:              [],
      progress:                    0,
      selectedProjects:                [],
      deselectedProjects:              [], // these are projects that had been annotated previously and are being removed now
      displayProjects:                 [], // on edit, only projects that haven't been fully annotated, or projects that are being removed, are shown in the inline project status table
      denouncedUpdateNotification:     () => {},
    };
  },

  watch: {
    // update deselectedProjects to include any projects that have any namespaces annotated with this policy's name
    // we dont want to include all projects that have been deselected from the dropdown because some may have been selected and deselected without hitting save
    // this would not error but would give us wrong totals in the notification
    selectedProjects(neu = [], old = []) {
      this.$emit('update:selectedProjects', neu);

      const removed = old.filter((oldP) => !neu.find((newP) => newP.id === oldP.id));

      if (removed) {
        // check if any of the namespaces were annotated. If yes, we need to make sure to UN-annotate them on save
        const wasAnnotated = removed.filter((p) => {
          const namespaces = p.namespaces || [];

          return !!namespaces.find((ns) => ns?.metadata?.annotations[ANNOTATIONS.POLICY] && ns?.metadata?.annotations[ANNOTATIONS.POLICY] === this.policy?.metadata?.name);
        });

        wasAnnotated.forEach((p) => {
          if (!this.deselectedProjects.find((project) => project.id === p.id)) {
            this.deselectedProjects.push(p);
            if (!this.displayProjects.find((project) => project.id === p.id)) {
              this.displayProjects.push(p);
            }
          }
        });
      }

      // if projects have been added to selectedProjects, make sure they are removed from deselectedProjects
      this.deselectedProjects = this.deselectedProjects.filter((p) => !neu.find((selectedProject) => selectedProject.id === p.id));

      // display projects should only include projects that are being removed (deselected projects) and projects that have been partially annotated
      neu.forEach((p) => {
        const namespaces = p.namespaces || [];

        const annotated = namespaces.filter((ns) => ns?.metadata?.annotations[ANNOTATIONS.POLICY] && ns?.metadata?.annotations[ANNOTATIONS.POLICY] === this.policy?.metadata?.name);

        const isPartiallyAnnotated = annotated.length !== namespaces.length;

        if (!isPartiallyAnnotated) {
          this.displayProjects = this.displayProjects.filter((displayProject) => displayProject.id !== p.id);
        }
      });
    }
  },

  methods: {
    // on edit find the store object for each project referenced in policy's annotation
    findSelectedProjects() {
      const allProjects = this.$store.getters['management/all']( MANAGEMENT.PROJECT);

      const ids = (this.policy?.metadata?.annotations?.[ANNOTATIONS.POLICY_ASSIGNED_TO] || '').split(',').map((id) => id.trim());

      if (!ids.length) {
        this.selectedProjects = [];
      }

      const selectedProjectObjects = ids.map((id) => this.$store.getters['management/byId']( MANAGEMENT.PROJECT, id));

      this.selectedProjects = selectedProjectObjects.filter((p) => p && p.id);

      // projects with policy annotation that are NOT in the policy's annotation are projects that the user attempted to unassign
      // annotation is only removed from project when unassignment is successful in all of its namespaces
      this.deselectedProjects = allProjects.filter((p) => p?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this?.policy?.metadata?.name && !this.selectedProjects.find((sp) => sp.id === p.id));

      const selectedButInError = this.selectedProjects.filter((p) => {
        const namespaces = p.namespaces || [];

        return namespaces.find((ns) => {
          return (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] !== this.policy?.metadata?.name ) || ns.__policyPermissionError || ns.__policyServerError;
        });
      });

      this.displayProjects = [...selectedButInError, ...this.deselectedProjects];
    },

    async getProjectOptions() {
      this.projectOptions = [];
      const allProjects = this.$store.getters['management/all']({ type: MANAGEMENT.PROJECT });

      await allProjects.forEach(async(p) => {
        const ns = p.namespaces || [];

        // don't include projects with no namespaces: there is nothing to be assigned/unassigned
        if (!ns.length) {
          return;
        }
        const policyAnnotation = p?.metadata?.annotations?.[ANNOTATIONS.POLICY] || '';

        // project is assigned to a different policy: if that policy exists, the project shouldnt be offered here
        if (policyAnnotation && policyAnnotation !== this?.policy?.metadata?.name) {
          try {
            const exists = await this.$store.dispatch('cluster/find', { type: K3K.POLICY, id: policyAnnotation });

            if (exists) {
              return;
            }
          } catch {
            // catch 404 when looking for a policy that has been deleted
            this.projectOptions.push( {
              label: p?.spec?.displayName,
              value: p
            });
          }
        } else {
          this.projectOptions.push( {
            label: p?.spec?.displayName,
            value: p
          });
        }
      });
    },

    // avoiding automatic retry logic because it crashes the UI when every ns fails and is retried
    // because that retry involves making a GET request for each namespace and then another PUT request
    // normal save method is also very slow even when everything goes right
    saveNamespaceLite(ns = {}) {
      if (!ns.metadata?.name) {
        return;
      }

      const url = `/k8s/clusters/${ this.currentCluster.id }/v1/namespaces/${ ns.metadata.name }`;

      return this.$store.dispatch('cluster/request', {
        url, method: 'PUT', data: ns.cleanForSave(JSON.parse(JSON.stringify(ns)))
      });
    },

    // this function is also used to UN-annotate and save namespaces in projects that have been deselected on edit
    async annotateAndSaveNamespaces() {
      // TODO nb do these actually need to be defined here? Doesn't make sense when this.updateNotification works outside of the create page
      let toBeAssignedCount = 0;
      let toBeUnAssssignedCount = 0;
      const nsWillSave = [];
      const nsDone = this.namespacesDone; // namespaces in the state we want them in. Maybe annotated in a previous 'save' call; maybe annotated just now
      const nsErrored = [];
      let nsSaveAttemptedCount = 0; // maybe succeeded maybe not. Used to calculate how far thru saving we are
      const projectsWithServerErrors = [];
      const projectsWithPermissionErrors = [];
      const notificationID = randomStr();
      const policyName = `${ this.policy?.metadata?.name }`;

      const editRoute = { ...this.policy?.detailLocation || {}, query: { [MODE]: _EDIT, [AS]: _UNFLAG } };

      const editPath = this.$router.resolve(editRoute)?.fullPath;

      this.selectedProjects.forEach((p) => {
        const namespaces = p.namespaces || [];

        namespaces.forEach((ns) => {
          if (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policy?.metadata?.name && !ns.__policyPermissionError && !ns.__policyServerError) {
            nsDone.push(ns.id);

            return;
          }
          toBeAssignedCount++;

          nsWillSave.push(ns);

          ns.setAnnotation(ANNOTATIONS.POLICY, this.policy?.metadata?.name);
        });
      });

      this.deselectedProjects.forEach((p) => {
        const namespaces = p.namespaces || [];

        namespaces.forEach((ns) => {
          if (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] !== this.policy?.metadata?.name && !ns.__policyPermissionError && !ns.__policyServerError) {
            nsDone.push(ns.id);

            return;
          }
          toBeUnAssssignedCount++;
          nsWillSave.push(ns);

          ns.setAnnotation(ANNOTATIONS.POLICY, null); // remove this key from the annotations object
        });
      });

      this.showModal = (nsWillSave?.length + nsDone.length) > MODAL_SHOW_THRESHOLD;

      const computeProgress = () => {
        return Math.round(( nsSaveAttemptedCount / (toBeUnAssssignedCount + toBeAssignedCount)) * 100);
      };

      const saveEachNamespace = (namespace) => {
        return new Promise((resolve, reject) => {
          this.saveNamespaceLite(namespace)
            .then(() => {
              nsDone.push(namespace.id);
              nsSaveAttemptedCount++;

              // one of these values may be set to true if this current run is re-trying a namespace
              // need to clear it so the table reflects that there are no more ns in error
              namespace.__policyServerError = false;
              namespace.__policyPermissionError = false;
              if (!this.showModal) {
                this.denouncedUpdateNotification({
                  toBeAssignedCount, toBeUnAssssignedCount, nsDone, nsErrored, projectsWithServerErrors, projectsWithPermissionErrors, policyName, editPath, notificationID,
                });
              } else {
                this.updateModalTable(namespace.project);
                this.progress = computeProgress();
              }

              resolve();
            })
            .catch((e) => {
              nsErrored.push(namespace.id);
              nsSaveAttemptedCount++;
              if (namespace?.metadata?.annotations?.[ANNOTATIONS.POLICY] === policyName) {
                namespace.setAnnotation(ANNOTATIONS.POLICY, null);
              } else {
                namespace.setAnnotation(ANNOTATIONS.POLICY, policyName);
              }

              // TODO nb permissionError and serverError
              namespace.__policyServerError = true;
              this.hasErrors = true;

              const projectName = namespace?.project?.nameDisplay;

              if (projectName && !projectsWithServerErrors.includes(projectName)) {
                projectsWithServerErrors.push(projectName);
              }
              if (!this.showModal) {
                this.denouncedUpdateNotification({
                  toBeAssignedCount, toBeUnAssssignedCount, nsDone, nsErrored, projectsWithServerErrors, projectsWithPermissionErrors, policyName, editPath, notificationID,
                });
              } else {
                this.updateModalTable(namespace.project);
                this.progress = computeProgress();
              }
              resolve();
            });
        });
      };

      try {
        await Promise.all( this.selectedProjects.map((p) => {
          p.setAnnotation(ANNOTATIONS.POLICY, this.policy?.metadata?.name);

          return p.save();
        }));
      } catch {
      }

      try {
        await Promise.all(nsWillSave.map((ns) => {
          return saveEachNamespace(ns);
        }));
        // TODO nb give own function? Or at least clean this shit up
        try {
          await Promise.all( this.deselectedProjects.map((p) => {
            if (!projectsWithPermissionErrors.includes(p.nameDisplay) && !projectsWithServerErrors.includes(p.nameDisplay)) {
              p.setAnnotation(ANNOTATIONS.POLICY, null);

              return p.save();
            }
          }));
        } catch {
        }
        this.doneSavingNamespaces = true;
      } catch (e) {
        if (!this.showModal) {
          this.$emit('finish');
        }

        try {
          await Promise.all( this.deselectedProjects.map((p) => {
            if (!projectsWithPermissionErrors.includes(p.nameDisplay) && !projectsWithServerErrors.includes(p.nameDisplay)) {
              p.setAnnotation(ANNOTATIONS.POLICY, null);

              return p.save();
            }
          }));
        } catch {
        }
        this.doneSavingNamespaces = true;

        throw (e);
      }
      if (!this.showModal) {
        this.$emit('finish');
      }
      this.doneSavingNamespaces = true;
    },

    updateModalTable(p = {}, nsDone) {
      const modalTableComponent = this.$refs['modal-table'];

      if (modalTableComponent) {
        modalTableComponent.computeNamespaceStatus(p, nsDone);
      }
    },

    updateNotification({
      toBeAssignedCount = 0, toBeUnAssssignedCount = 0, nsDone = [], nsErrored = [], projectsWithServerErrors = [], projectsWithPermissionErrors = [], policyName = '', editPath, notificationID, addAnnotation = true
    }) {
      const totalNsTargeted = toBeAssignedCount + toBeUnAssssignedCount;

      if (!totalNsTargeted) {
        return;
      }
      // TODO nb fix notification messages to be "assigning x namespaces [and unassigning y namespaces...]"
      const translationKeyPath = addAnnotation ? 'k3k.policy.projects.notification.adding' : 'k3k.policy.projects.notification.removing';

      let level = NotificationLevel.Task;
      let title = this.t(`${ translationKeyPath }.task.title`);
      let message = this.t(`${ translationKeyPath }.task.message`, { namespaceCount: totalNsTargeted, policyName });
      let primaryAction = null;

      const isDone = totalNsTargeted === nsErrored?.length + nsDone?.length;
      const hasErrors = !!nsErrored?.length;
      const succeeded = isDone && !hasErrors;
      const progressPercent = Math.round((nsDone.length / totalNsTargeted) * 100);

      // show an error message with number of projects that failed in each category of failure
      if (isDone ) {
        if (!succeeded) {
          const allProjectsWithErrors = uniq([...projectsWithServerErrors, ...projectsWithPermissionErrors]);

          level = NotificationLevel.Error;
          title = this.t(`${ translationKeyPath }.error.title`);
          message = this.t(`${ translationKeyPath }.error.message`, { failCount: allProjectsWithErrors.length, policyName });

          allProjectsWithErrors.forEach((p) => {
            const isLast = allProjectsWithErrors[allProjectsWithErrors.length - 1] === p;

            if (allProjectsWithErrors.length === 1) {
              message += ` ${ p }.`;
            } else {
              if (!isLast) {
                message += ` ${ p },`;
              } else {
                message += `${ this.t('generic.and') }${ p }.`;
              }
            }
          });

          if (allProjectsWithErrors.length) {
            primaryAction = {
              label:  this.t('k3k.policy.projects.notification.secondaryAction'),
              route: editPath,
            };
          }
        } else {
          level = NotificationLevel.Success;
          title = this.t(`${ translationKeyPath }.success.title`);
          message = this.t(`${ translationKeyPath }.success.message`, { namespaceCount: nsDone.length, policyName });
        }
      }

      let storeAction = 'notifications/update';

      if (!this.notified) {
        storeAction = 'notifications/add';
      }

      this.$store.dispatch(storeAction, {
        level,
        title,
        message,
        progress: !isDone ? progressPercent : undefined,
        primaryAction,
        id:       notificationID
      });
      this.notified = true;
    },
  },

  computed: {
    ...mapGetters({ t: 'i18n/t', currentCluster: 'currentCluster' }),

    isCreate() {
      return this.mode === _CREATE;
    },

    sortedProjectOptions() {
      return sortBy(this.projectOptions, 'label');
    }

  },

};
</script>

<template>
  <div>
    <h3>
      {{ t('k3k.policy.headers.projectsAndNamespaces') }}
    </h3>
    <h5 class="text-muted">
      {{ t('k3k.policy.projects.subheader') }}
    </h5>
    <div class="row mb-20">
      <div class="col span-9">
        <LabeledSelect
          v-model:value="selectedProjects"
          :label="t('k3k.policy.projects.label')"
          class="project-select"
          :mode="mode"
          :options="sortedProjectOptions"
          multiple
        />
      </div>
    </div>
    <ProjectStatusTable
      v-if="displayProjects.length && !isCreate"
      :deselected-projects="deselectedProjects"
      :display-projects="displayProjects"
      :policy-name="policy?.metadata?.name"
      :mode="mode"
    />
    <AppModal
      v-if="showModal"
      name="assign-policies"
      :click-to-close="false"
      class="project-modal"
    >
      <div class="project-modal-content">
        <Banner
          v-if="doneSavingNamespaces && !hasErrors"
          color="success"
          :label="t('k3k.policy.projects.table.successBanner', {policyName: policy.metadata?.name || ''})"
        />
        <ProjectStatusTable
          ref="modal-table"
          :is-in-modal="true"
          :deselected-projects="deselectedProjects"
          :display-projects="[...selectedProjects, ...deselectedProjects]"
          :policy-name="policy?.metadata?.name"
          :done-saving-namespaces="doneSavingNamespaces"
          :namespaces-done="namespacesDone"
          :mode="mode"
        />
        <div class="project-modal-footer">
          <div
            v-if="!doneSavingNamespaces"
            class="progress-container"
          >
            <t
              class="progress-text"
              k="k3k.policy.projects.savingNamespaces"
              :progress="progress"
              raw
            />

            <ProgressBar :progress="progress" />
          </div>
          <Banner
            v-if="doneSavingNamespaces && hasErrors"
            color="error"
            :label="t('k3k.policy.projects.table.errorBannerModal')"
          />
          <div
            v-if="doneSavingNamespaces"
            class="buttons"
          >
            <button
              v-if="hasErrors"
              class="btn role-secondary mr-5"
              @click="policy.goToEdit()"
            >
              {{ t('k3k.policy.projects.editPolicy') }}
            </button>
            <button
              class="btn role-primary"
              @click="$emit('finish')"
            >
              {{ t('generic.done') }}
            </button>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style lang="scss" scoped>
.project-select :deep().vs__selected {
    width:fit-content !important;
}

:deep(.project-modal) {
  padding: 20px;
}

.project-modal-content {
  padding: 20px;
}

.project-modal-footer {
  overflow: hidden;

  & .progress-container {
    display: flex;
    flex-direction: column;
    margin-top: 20px;

    &>.progress-text{
      align-self: center;
      margin-bottom: 8px;
      color: var(--input-label);
      font-size: 16px;
    }
  }

  & .buttons {
  margin-top: 20px;

   display: flex;
   justify-content: flex-end;
  }
}

</style>
