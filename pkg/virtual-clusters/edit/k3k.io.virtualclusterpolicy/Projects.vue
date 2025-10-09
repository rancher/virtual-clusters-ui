<script>
import {
  _CREATE, _EDIT, _UNFLAG, AS, MODE
} from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { randomStr } from '@shell/utils/string';
import { sortBy } from '@shell/utils/sort';
import { MANAGEMENT } from '@shell/config/types';
import { NotificationLevel } from '@shell/types/notifications';

import { ANNOTATIONS } from '../../types';
import ProjectTable from './ProjectTable.vue';

import { mapGetters } from 'vuex';
import uniq from 'lodash/uniq';
import debounce from 'lodash/debounce';

export default {
  name: 'K3kPolicyProjectSelect',

  emits: ['update:errors', 'update:projectAnnotation', 'update:selectedProjects', 'update:userCanTry'],

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    policy: {
      type:    Object,
      default: () => {}
    },

    userCanTry: {
      type:    Boolean,
      default: false
    },

    registerAfterHook: {
      type:     Function,
      default: () => {}
    },

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
    this.registerAfterHook(this.annotateAndSaveAllNamespaces, 'annotate-namespaces');
    this.registerAfterHook(this.unAnnotateAndSaveAllNamespaces, 'unannotate-namespaces');

    this.findSelectedProjects();
    this.denouncedUpdateNotification = debounce(this.updateNotification, 50);
  },

  components: { LabeledSelect, ProjectTable },

  data() {
    return {
      selectedProjects:                [],
      deselectedProjects:              [], // these are projects that had been annotated previously and are being removed now
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
        const wasAnnotated = removed.filter((p) => {
          const namespaces = p.namespaces;

          return !!namespaces.find((ns) => ns?.metadata?.annotations[ANNOTATIONS.POLICY] && ns?.metadata?.annotations[ANNOTATIONS.POLICY] === this.policy?.metadata?.name);
        });

        wasAnnotated.forEach((p) => {
          if (!this.deselectedProjects.find((project) => project.id === p.id)) {
            this.deselectedProjects.push(p);
          }
        });
      }
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

      // TODO nb load state in ns status table
      this.selectedProjects = projects.filter((p) => p && p.id);
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
        return this.annotateAndSaveAllNamespaces(this.deselectedProjects, () => {}, () => {}, false);
      }
    },

    // TODO nb stay on page vs leave page if # of ns too high?
    async annotateAndSaveAllNamespaces(projects, cb = () => {}, btnCb = () => {}, addAnnotation = true) {
      projects = projects && projects.length ? projects : this.selectedProjects;
      this.savingNamespaces = true;

      /**
       * these are stored as consts in this method so they're accessible in the after hook context
       * they are used to generate the notification and its buttons (try again and edit policy)
       * nsWillSave, nsSaved, errorCount are used to compute which notification message to show
       * projectsWithServerErrors and projectsWithPermissionErrors are used to create a bulleted list in the notification and decide whether or not to show 'try again' button
       * notificationID is used to ensure we create/modify one notification per 'save' click - one notification when policy is saved and also one per click on 'try again' from edit mode
       */
      const nsWillSave = [];
      const nsSaved = [];
      let errorCount = 0;
      const projectsWithServerErrors = [];
      const projectsWithPermissionErrors = [];
      const notificationID = randomStr();
      const policyName = `${ this.policy?.metadata?.name }`;
      const detailLocation = this.policy?.detailLocation || {};
      const editRoute = {
        ...detailLocation,
        query: {
          ...detailLocation.query, [MODE]: _EDIT, [AS]: _UNFLAG
        }
      };

      const editPath = this.$router.resolve(editRoute)?.fullPath;

      const isLastToSave = () => {
        return nsWillSave.length && nsWillSave.length === nsSaved.length + errorCount;
      };

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
                nsWillSave, nsSaved, errorCount, projectsWithServerErrors, projectsWithPermissionErrors, policyName, editPath, notificationID, addAnnotation
              });
              // tell the project status table that this ns is done and tell it whether or not this is the last one
              cb(namespace);
              // TODO nb need a better way of knowing if this is the last one
              // make the status component call asyncbutton cb when it detects all have been re-run and reported back?
              if (isLastToSave()) {
                btnCb(!!errorCount);
              }
              resolve();
            })
            .catch((e) => {
              errorCount++;

              // TODO nb permissionError and serverError
              namespace.__policyServerError = true;

              const projectName = namespace?.project?.nameDisplay;

              if (projectName && !projectsWithServerErrors.includes(projectName)) {
                projectsWithServerErrors.push(projectName);
              }
              // tell the project status table that this ns is done and tell it whether or not this is the last one
              cb(namespace);
              if (isLastToSave()) {
                btnCb(false);
              }

              this.denouncedUpdateNotification({
                nsWillSave, nsSaved, errorCount, projectsWithServerErrors, projectsWithPermissionErrors, policyName, editPath, notificationID, addAnnotation
              });
              // reject(e);
            });
        });
      };

      const allSelectedNamespaces = projects.reduce((all, p) => {
        if (p.namespaces && p.namespaces?.length) {
          all.push(...p.namespaces);
        }

        return all;
      }, []);

      Promise.all(allSelectedNamespaces.map((ns) => {
        nsWillSave.push(ns.id);

        // if we are adding annotations to this project's namespaces, check if it is already present each namespace and skip saving that namespace if so
        if (addAnnotation) {
          if (ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policy?.metadata?.name) {
            nsSaved.push(ns.id);
            cb(ns);

            return;
          }

          ns.setAnnotation(ANNOTATIONS.POLICY, this.policy?.metadata?.name);
        } else {
          // if we are removing annotations from all ns in this project, verify that each namespace has the annotation and skip saving any that are already missing it
          // this will come up a lot eg if a user sees that only some namespaces in a project worked and decides to 'deselect' the whole project
          if (!ns?.metadata?.annotations?.[ANNOTATIONS.POLICY] === this.policy?.metadata?.name) {
            nsSaved.push(ns.id);
            cb(ns);

            return;
          }
          ns.setAnnotation(ANNOTATIONS.POLICY); // remove this key from the annotations object
        }

        return saveEachNamespace(ns);
      }));

      this.savingNamespaces = false;
    },

    retryProject(project, cb, btnCb) {
      this.annotateAndSaveAllNamespaces([project], cb, btnCb);
    },

    updateNotification({
      nsWillSave = [], nsSaved = [], errorCount = 0, projectsWithServerErrors = [], projectsWithPermissionErrors = [], policyName = '', editPath, notificationID, addAnnotation = true
    }) {
      if (!nsWillSave || !nsWillSave.length) {
        return;
      }

      const translationKeyPath = addAnnotation ? 'k3k.policy.projects.notification.adding' : 'k3k.policy.projects.notification.removing';

      let level = NotificationLevel.Task;
      let title = this.t(`${ translationKeyPath }.task.title`);
      let message = this.t(`${ translationKeyPath }.task.message`, { namespaceCount: nsWillSave.length, policyName });
      let primaryAction = null;

      const isDone = nsWillSave?.length === errorCount + nsSaved?.length;
      const hasErrors = !!errorCount;
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

          // TODO nb should be blocking the try again action, not the go to edit action
          if (projectsWithServerErrors.length) {
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

      // TODO nb secondary action to retry - requires extensions api changes
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
      v-if="selectedProjects.length && !isCreate"
      v-model:selected-projects="selectedProjects"
      :user-can-try="userCanTry"
      :policy-name="policy?.metadata?.name"
      :mode="mode"
      @retry-project="retryProject"
      @update:user-can-try="e=>$emit('update:userCanTry', e)"
    />
  </div>
</template>

<style lang="scss" scoped>
.project-select :deep().vs__selected {
    width:fit-content !important;
}
</style>
