<script>
import {
  _CREATE, _EDIT, _UNFLAG, AS, MODE
} from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { randomStr } from '@shell/utils/string';
import { sortBy } from '@shell/utils/sort';
import { MANAGEMENT, NAMESPACE } from '@shell/config/types';
import { NotificationLevel } from '@shell/types/notifications';
import AppModal from '@shell/components/AppModal.vue';
import ProgressBar from './ProgressBar.vue';
import { Banner } from '@rancher/components';

import { ANNOTATIONS, LABELS, K3K } from '../../types';
import ProjectStatusTable from './ProjectStatusTable.vue';

import { mapGetters } from 'vuex';

/**
 * if the total number of namespaces being assigned and unassigned exceeds this number, the user will be forced to stay on the policy creation page
 * and shown a progress modal
 * otherwise they will be kicked back to the policy list view right away
 * and error/success will be reported through the notification center
 */
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
      this.findProjectsFromAnnotations();
    }
    this.getProjectOptions();
  },

  data() {
    return {
      projectOptions:              [],
      showModal:                   false,
      doneSavingNamespaces:        false,
      hasErrors:                   false,
      namespacesDone:              [],
      progress:                    0,
      nsWillSave:                  [], // namespaces to be edited
      toBeAssignedCount:           0,
      toBeUnAssssignedCount:       0,
      nsSaveAttemptedCount:        0, // maybe succeeded maybe not. Used to calculate how far thru saving we are
      nsErrored:                   [],
      projectsWithServerErrors:    [], // track which projects have been fully assigned/unassigned and annotate the project as well

      selectedProjects:            [],
      deselectedProjects:          [], // these are projects that had been annotated previously and are being removed now
      displayProjects:             [], // on edit, only projects that haven't been fully annotated, or projects that are being removed, are shown in the inline project status table
    };
  },

  watch: {
    // update deselectedProjects to include any projects that have any namespaces annotated with this policy's name
    // we dont want to include all projects that have been deselected from the dropdown because some may have been selected and deselected without hitting save
    // this would not error but would give us wrong totals in the notification
    selectedProjects(neu = [], old = []) {
      this.$emit('update:selectedProjects', neu);

      const removed = old.filter((oldP) => !neu.find((newP) => newP.id === oldP.id));

      // check if any of the namespaces were annotated. If yes, we need to make sure to UN-annotate them on save
      const wasAnnotated = removed.filter((p) => {
        const namespaces = p.namespaces || [];

        return !!namespaces.find((ns) => ns?.metadata?.labels[LABELS.POLICY] && ns?.metadata?.labels[LABELS.POLICY] === this.policy?.metadata?.name);
      });

      wasAnnotated.forEach((p) => {
        if (!this.deselectedProjects.find((project) => project.id === p.id)) {
          this.deselectedProjects.push(p);
          if (!this.displayProjects.find((project) => project.id === p.id)) {
            this.displayProjects.push(p);
          }
        }
      });

      // if projects have been added to selectedProjects, make sure they are removed from deselectedProjects
      this.deselectedProjects = this.deselectedProjects.filter((p) => !neu.find((selectedProject) => selectedProject.id === p.id));

      // display projects should only include projects that are being removed (deselected projects) and projects that have been partially annotated
      neu.forEach((p) => {
        const namespaces = p.namespaces || [];

        const annotated = namespaces.filter((ns) => ns?.metadata?.labels[LABELS.POLICY] && ns?.metadata?.labels[LABELS.POLICY] === this.policy?.metadata?.name);

        const isPartiallyAnnotated = annotated.length !== namespaces.length;

        if (!isPartiallyAnnotated) {
          this.displayProjects = this.displayProjects.filter((displayProject) => displayProject.id !== p.id);
        }
      });
    }
  },

  methods: {
    /**
     * POLICY_ASSIGNED_TO annotation on the policy resource is used to determine which projects to show in the dropdown on edit
     * if a project has a label for the policy but is not, itself, in the policy's annotation, assume the user is trying to remove the project
     * (the ui removes the label from the project when all namespaces have been unlabeled)
     */
    findProjectsFromAnnotations() {
      const allProjects = this.$store.getters['management/all']( MANAGEMENT.PROJECT);

      const ids = (this.policy?.metadata?.annotations?.[ANNOTATIONS.POLICY_ASSIGNED_TO] || '').split(',').map((id) => id.trim());

      if (!ids.length) {
        this.selectedProjects = [];
      }

      const selectedProjectObjects = ids.map((id) => this.$store.getters['management/byId']( MANAGEMENT.PROJECT, id));

      this.selectedProjects = selectedProjectObjects.filter((p) => p && p.id);

      this.deselectedProjects = allProjects.filter((p) => p?.metadata?.labels?.[LABELS.POLICY] === this?.policy?.metadata?.name && !this.selectedProjects.find((sp) => sp.id === p.id));
      const selectedButInError = this.selectedProjects.filter((p) => {
        const namespaces = p.namespaces || [];

        return namespaces.find((ns) => {
          return (ns?.metadata?.labels?.[LABELS.POLICY] !== this.policy?.metadata?.name ) || ns.__policyServerError;
        });
      });

      this.displayProjects = [...selectedButInError, ...this.deselectedProjects];
    },

    // filter out projects without namespaces and projects assigned to other policies
    async getProjectOptions() {
      this.projectOptions = [];
      const allProjects = this.$store.getters['management/all']({ type: MANAGEMENT.PROJECT });

      await allProjects.forEach(async(p) => {
        const ns = p.namespaces || [];

        if (!ns.length) {
          return;
        }
        const policyLabel = p?.metadata?.labels?.[LABELS.POLICY] || '';

        if (policyLabel && policyLabel !== this?.policy?.metadata?.name) {
          try {
            const exists = await this.$store.dispatch('cluster/find', { type: K3K.POLICY, id: policyLabel });

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

    /**
     * This function bypasses the usual resource save method because its noticably slower when saving ~hundreds of namespaces
     * and automatically retrying requests that return 409 responses seems to compound the flakiness of saving a ton of namespaces at once
     * @param ns namespace resource to be updated
     */
    async saveNamespaceLite(ns = {}) {
      if (!ns.metadata?.name) {
        return;
      }

      const url = `/k8s/clusters/${ this.currentCluster.id }/v1/namespaces/${ ns.metadata.name }`;

      return await this.$store.dispatch('cluster/request', {
        url, method: 'PUT', data: ns.cleanForSave(JSON.parse(JSON.stringify(ns)))
      });
    },

    // also  UN-annotate and save namespaces
    async annotateAndSaveNamespaces() {
      let {
        nsWillSave, toBeAssignedCount, toBeUnAssssignedCount, nsSaveAttemptedCount, namespacesDone: nsDone, nsErrored, projectsWithServerErrors
      } = this;
      // const nsWillSave = []; // namespaces to be edited
      // let toBeAssignedCount = 0;
      // let toBeUnAssssignedCount = 0;
      // let nsSaveAttemptedCount = 0; // maybe succeeded maybe not. Used to calculate how far thru saving we are
      // const nsDone = this.namespacesDone; // namespaces in the state we want them in. Maybe annotated in a previous 'save' call; maybe annotated just now

      // const nsErrored = [];
      // const projectsWithServerErrors = []; // track which projects have been fully assigned/unassigned and annotate the project as well

      const policyName = `${ this.policy?.metadata?.name }`;
      const editRoute = { ...this.policy?.detailLocation || {}, query: { [MODE]: _EDIT, [AS]: _UNFLAG } };
      const editPath = this.$router.resolve(editRoute)?.fullPath; // edit path is used to add a 'go to edit' button to failure notifications

      this.selectedProjects.forEach((p) => {
        const namespaces = p.namespaces || [];

        namespaces.forEach((ns) => {
          if (ns?.metadata?.labels?.[LABELS.POLICY] === this.policy?.metadata?.name && !ns.__policyServerError) {
            nsDone.push(ns.id);

            return;
          }
          toBeAssignedCount++;

          nsWillSave.push(ns);

          ns.setLabel(LABELS.POLICY, this.policy?.metadata?.name);
        });
      });

      this.deselectedProjects.forEach((p) => {
        const namespaces = p.namespaces || [];

        namespaces.forEach((ns) => {
          if (ns?.metadata?.labels?.[LABELS.POLICY] !== this.policy?.metadata?.name && !ns.__policyServerError) {
            nsDone.push(ns.id);

            return;
          }
          toBeUnAssssignedCount++;
          nsWillSave.push(ns);

          ns.setLabel(LABELS.POLICY, null); // remove this key from the label object
        });
      });

      this.showModal = (nsWillSave?.length + nsDone.length) > MODAL_SHOW_THRESHOLD;

      const computeProgress = () => {
        return Math.round(( nsSaveAttemptedCount / (toBeUnAssssignedCount + toBeAssignedCount)) * 100);
      };

      const verifyNamespaceWasUpdated = async(namespace) => {
        const shouldBeLabeled = !!namespace?.metdata?.labels[LABELS.POLICY];
        const refreshed = await this.$store.dispatch('cluster/find', {
          type: NAMESPACE, id: namespace.id, opt: { force: true }
        });

        return shouldBeLabeled ? !!refreshed?.metadata?.labels[LABELS.POLICY] : !refreshed?.metadata?.labels[LABELS.POLICY];
      };

      const reportNamespaceSaved = (namespace) => {
        nsDone.push(namespace.id);
        nsSaveAttemptedCount++;

        // one of these values may be set to true if this current run is re-trying a namespace
        // need to clear it so the table reflects that there are no more ns in error
        namespace.__policyServerError = false;

        if (this.showModal) {
          this.updateModalTable(namespace.project);
          this.progress = computeProgress();
        }
      };

      const reportNamesapceFailedToSave = (namespace) => {
        nsErrored.push(namespace.id);
        nsSaveAttemptedCount++;

        namespace.__policyServerError = true;
        this.hasErrors = true;

        const projectName = namespace?.project?.nameDisplay;

        if (namespace?.metadata?.labels?.[LABELS.POLICY] === policyName) {
          namespace.setLabel(LABELS.POLICY, null);
        } else {
          namespace.setLabel(LABELS.POLICY, policyName);
        }

        if (projectName && !projectsWithServerErrors.includes(projectName)) {
          projectsWithServerErrors.push(projectName);
        }
        if (this.showModal) {
          this.updateModalTable(namespace.project);
          this.progress = computeProgress();
        }
      };

      const saveEachNamespace = async(namespace) => {
        try {
          await this.saveNamespaceLite(namespace);
          reportNamespaceSaved(namespace);
        } catch (e) {
          // Sometimes the server sends 500 responses but the namespace did save successfully
          // when we get 500 errors we re-fetch the namespace from the server to see if the label actually was applied
          if (e._status === 500) {
            const wasSaved = await verifyNamespaceWasUpdated(namespace);

            if (wasSaved) {
              reportNamespaceSaved(namespace);

              return;
            }
          }
          reportNamesapceFailedToSave(namespace);
        }
      };

      // annotate/un-annotate projects to help the UI track what to show during edit
      try {
        await Promise.all( this.selectedProjects.map((p) => {
          p.setLabel(LABELS.POLICY, this.policy?.metadata?.name);

          return p.save();
        }));
      } catch {
        this.addProjectNotification({ policyName, editPath });
      }

      try {
        await Promise.all(nsWillSave.map((ns) => {
          return saveEachNamespace(ns);
        }));
        this.doneSavingNamespaces = true;
      } catch (e) {
        if (!this.showModal) {
          this.$emit('finish');
        }

        this.doneSavingNamespaces = true;
      }

      try {
        await Promise.all( this.deselectedProjects.map((p) => {
          if (!projectsWithServerErrors.includes(p.nameDisplay)) {
            p.setLabel(LABELS.POLICY, null);

            return p.save();
          }
        }));
      } catch {
        this.addProjectNotification({ editPath });
      }

      if (!this.showModal) {
        this.addAssignmentNotification({ editPath });
        this.$emit('finish');
      }
      this.doneSavingNamespaces = true;
    },

    // each time a ns finishes saving/errors out tell the live status table to update only that namespace's project's row
    updateModalTable(p = {}) {
      const modalTableComponent = this.$refs['modal-table'];

      if (modalTableComponent) {
        modalTableComponent.computeNamespaceStatus(p, this.namespacesDone);
      }
    },

    // notification when assignment/unassignment succeeds/fails
    addAssignmentNotification({ editPath }) {
      const { toBeAssignedCount, toBeUnAssssignedCount, nsErrored = [] } = this;
      const policyName = this.policy?.metadata?.name;
      const nsTargetedCount = toBeAssignedCount + toBeUnAssssignedCount;

      if (!nsTargetedCount) {
        return;
      }
      let translationKeyPath;

      if (toBeAssignedCount) {
        if (!toBeUnAssssignedCount) {
          translationKeyPath = 'k3k.policy.projects.notification.addingNamespaces';
        } else {
          translationKeyPath = 'k3k.policy.projects.notification.addingAndRemovingNamespaces';
        }
      } else {
        translationKeyPath = 'k3k.policy.projects.notification.removingNamespaces';
      }

      let level = NotificationLevel.Task;
      let title = this.t(`${ translationKeyPath }.task.title`);
      let message = this.t(`${ translationKeyPath }.task.message`, {
        namespaceCount:      toBeAssignedCount || toBeUnAssssignedCount,
        removeCount:    toBeUnAssssignedCount,
        policyName,
      });
      let primaryAction = null;

      const succeeded = !nsErrored?.length;

      if (!succeeded) {
        level = NotificationLevel.Error;
        title = this.t(`${ translationKeyPath }.error.title`);
        message = this.t(`${ translationKeyPath }.error.message`, { policyName, removeCount: toBeUnAssssignedCount });

        if (nsErrored.length) {
          primaryAction = {
            label:  this.t('k3k.policy.projects.notification.primaryAction'),
            route: editPath,
          };
        }
      } else {
        level = NotificationLevel.Success;
        title = this.t(`${ translationKeyPath }.success.title`);
        message = this.t(`${ translationKeyPath }.success.message`, {
          namespaceCount:       toBeAssignedCount || toBeUnAssssignedCount,
          removeCount:    toBeUnAssssignedCount,
          policyName
        });
      }

      this.$store.dispatch('notifications/add', {
        level,
        title,
        message,
        primaryAction,
        id: randomStr()
      });
    },

    // notification if annotating projects fails
    addProjectNotification({ editPath }) {
      const policyName = this.policy?.metadata?.name;

      this.$store.dispatch('notifications/add', {
        level:         NotificationLevel.Error,
        title:         this.t('k3k.policy.projects.notification.savingProjects.title'),
        message:       this.t('k3k.policy.projects.notification.savingProjects.message', { policyName }),
        primaryAction:            {
          label:  this.t('k3k.policy.projects.notification.primaryAction'),
          route: editPath,
        },
        id: randomStr()
      });
    }
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
