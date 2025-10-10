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

import { ANNOTATIONS } from '../../types';
import ProjectTable from './ProjectTable.vue';

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

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    policy: {
      type:    Object,
      default: () => {}
    },

    // registerAfterHook: {
    //   type:     Function,
    //   default: () => {}
    // },

    registerBeforeHook: {
      type:     Function,
      default: () => {}
    },

    errors: {
      type:    Array,
      default: () => []
    }

  },

  created() {
    // this.registerBeforeHook(this.annotateAndSaveNamespaces, 'annotate-namespaces');
    // this.registerBeforeHook(this.unAnnotateAndSaveAllNamespaces, 'unannotate-namespaces');

    this.findSelectedProjects();
    this.denouncedUpdateNotification = debounce(this.updateNotification, 50);
  },

  components: {
    LabeledSelect,
    ProjectTable,
    AppModal
  },

  data() {
    return {
      showModal:                   false,
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
      const ids = (this.policy?.metadata?.annotations?.[ANNOTATIONS.POLICY_ASSIGNED_TO] || '').split(',').map((id) => id.trim());

      if (!ids.length) {
        this.selectedProjects = [];
      }

      const projects = ids.map((id) => this.$store.getters['management/byId']( MANAGEMENT.PROJECT, id));

      this.selectedProjects = projects.filter((p) => p && p.id);

      this.displayProjects = this.selectedProjects.filter((p) => {
        const namespaces = p.namespaces || [];

        return namespaces.find((ns) => {
          return (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] !== this.policy?.metadata?.name ) || ns.__policyPermissionError || ns.__policyServerError;
        });
      });
    },

    // avoiding automatic retry logic because it crashes the UI when every ns fails and is retried
    saveNamespaceLite(ns = {}) {
      if (!ns.metadata?.name) {
        return;
      }
      const url = `/k8s/clusters/${ this.currentCluster.id }/v1/namespaces/${ ns.metadata.name }`;

      return this.$store.dispatch('cluster/request', {
        url, method: 'PUT', data: ns.cleanForSave(JSON.parse(JSON.stringify(ns)))
      });
    },

    async unAnnotateAndSaveAllNamespaces() {
      if (this.deselectedProjects.length) {
        return this.annotateAndSaveNamespaces(false);
      }
    },

    // TODO nb do annotate and un-annotate in one function
    // this function is also used to UN-annotate and save namespaces in projects that have been deselected on edit
    async annotateAndSaveNamespaces(addAnnotation = true) {
      const projects = addAnnotation ? this.selectedProjects || [] : this.deselectedProjects || [];
      /**
       * these are stored as consts in this method so they're accessible in the after hook context
       * they are used to generate the notification and its buttons (try again and edit policy)
       * nsWillSave, nsSaved, nsErrored are used to compute which notification message to show
       * projectsWithServerErrors and projectsWithPermissionErrors are used to create a bulleted list in the notification and decide whether or not to show 'try again' button
       * notificationID is used to ensure we create/modify one notification per 'save' click - one notification when policy is saved and also one per click on 'try again' from edit mode
       */
      const nsWillSave = [];
      const nsSaved = [];
      const nsErrored = [];
      const projectsWithServerErrors = [];
      const projectsWithPermissionErrors = [];
      const notificationID = randomStr();
      const policyName = `${ this.policy?.metadata?.name }`;
      // this runs before save, so we can't just use the policy's detailLocation getter
      const editRoute = {
        ...this.$route,
        name:   'c-cluster-product-resource-id',
        params: {
          cluster:  this.currentCluster?.id,
          id:       policyName,
          product:  'virtualclusters',
          resource: 'k3k.io.virtualclusterpolicy'
        },
        query: { [MODE]: _EDIT, [AS]: _UNFLAG }
      };

      const editPath = this.$router.resolve(editRoute)?.fullPath;

      const allSelectedNamespaces = projects.reduce((all, p) => {
        if (p.namespaces && p.namespaces?.length) {
          all.push(...p.namespaces);
        }

        return all;
      }, []);

      this.showModal = allSelectedNamespaces?.length > MODAL_SHOW_THRESHOLD;

      const saveEachNamespace = (namespace) => {
        return new Promise((resolve, reject) => {
          this.saveNamespaceLite(namespace)
            .then(() => {
              nsSaved.push(namespace.id);

              // one of these values may be set to true if this current run is re-trying a namespace
              // need to clear it so the table reflects that there are no more ns in error
              namespace.__policyServerError = false;
              namespace.__policyPermissionError = false;

              this.denouncedUpdateNotification({
                nsWillSave, nsSaved, nsErrored, projectsWithServerErrors, projectsWithPermissionErrors, policyName, editPath, notificationID, addAnnotation
              });

              resolve();
            })
            .catch((e) => {
              nsErrored.push(namespace.id);

              // TODO nb permissionError and serverError
              namespace.__policyServerError = true;

              const projectName = namespace?.project?.nameDisplay;

              if (projectName && !projectsWithServerErrors.includes(projectName)) {
                projectsWithServerErrors.push(projectName);
              }

              this.denouncedUpdateNotification({
                nsWillSave, nsSaved, nsErrored, projectsWithServerErrors, projectsWithPermissionErrors, policyName, editPath, notificationID, addAnnotation
              });
              // reject(e);
            });
        });
      };

      await Promise.all(allSelectedNamespaces.map((ns) => {
        nsWillSave.push(ns.id);

        // if we are adding annotations to this project's namespaces, check if it is already present each namespace and skip saving that namespace if so
        if (addAnnotation) {
          if (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policy?.metadata?.name && !ns.__policyPermissionError && !ns.__policyServerError) {
            nsSaved.push(ns.id);

            return;
          }

          ns.setAnnotation(ANNOTATIONS.POLICY, this.policy?.metadata?.name);
        } else {
          // if we are removing annotations from all ns in this project, verify that each namespace has the annotation and skip saving any that are already missing it
          // this will come up a lot eg if a user sees that only some namespaces in a project worked and decides to 'deselect' the whole project
          if (!ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policy?.metadata?.name && !ns.__policyPermissionError && !ns.__policyServerError) {
            nsSaved.push(ns.id);

            return;
          }
          ns.setAnnotation(ANNOTATIONS.POLICY); // remove this key from the annotations object
        }

        return saveEachNamespace(ns);
      }));
      if (!this.showModal) {
        this.$emit('finish');
      }
    },

    updateNotification({
      nsWillSave = [], nsSaved = [], nsErrored = [], projectsWithServerErrors = [], projectsWithPermissionErrors = [], policyName = '', editPath, notificationID, addAnnotation = true
    }) {
      if (!nsWillSave || !nsWillSave.length) {
        return;
      }

      const translationKeyPath = addAnnotation ? 'k3k.policy.projects.notification.adding' : 'k3k.policy.projects.notification.removing';

      let level = NotificationLevel.Task;
      let title = this.t(`${ translationKeyPath }.task.title`);
      let message = this.t(`${ translationKeyPath }.task.message`, { namespaceCount: nsWillSave.length, policyName });
      let primaryAction = null;

      const isDone = nsWillSave?.length === nsErrored?.length + nsSaved?.length;
      const hasErrors = !!nsErrored?.length;
      const succeeded = isDone && !hasErrors;

      const progressPercent = Math.round((nsSaved.length / nsWillSave.length) * 100);

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
          message = this.t(`${ translationKeyPath }.success.message`, { namespaceCount: nsSaved.length, policyName });
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

    allProjects() {
      return this.$store.getters['management/all']({ type: MANAGEMENT.PROJECT });
    },

    projectOptions() {
      return sortBy(this.allProjects.map((p) => {
        return {
          label: p?.spec?.displayName,
          value: p
        };
      }), 'label');
    }
  },

};
</script>

<template>
  <div>
    <h3>
      {{ t('k3k.policy.headers.projectsAndNamespaces') }}
    </h3>
    <h5>
      {{ t('k3k.policy.projects.subheader') }}
    </h5>
    <div class="row mb-20">
      <div class="col span-6">
        <LabeledSelect
          v-model:value="selectedProjects"
          :label="t('k3k.policy.projects.label')"
          class="project-select"
          :mode="mode"
          :options="projectOptions"
          multiple
        />
      </div>
    </div>
    <ProjectTable
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
    >
      <ProjectTable
        :deselected-projects="deselectedProjects"
        :display-projects="displayProjects"
        :policy-name="policy?.metadata?.name"
        :mode="mode"
      />
      <button
        class="btn role-primary"
        @click="$emit('finish')"
      >
        close
      </button>
    </AppModal>
  </div>
</template>

<style lang="scss" scoped>
.project-select :deep().vs__selected {
    width:fit-content !important;
}
</style>
