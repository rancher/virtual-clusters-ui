<script>
import { _CREATE } from '@shell/config/query-params';
import LabeledSelect from '@shell/components/form/LabeledSelect';

import { mapGetters } from 'vuex';
import { MANAGEMENT, NAMESPACE } from '@shell/config/types';
import { PROJECT } from '@shell/config/labels-annotations';

import { ANNOTATIONS } from '../../types';
import ProjectSaveStatus from './ProjectSaveStatus.vue';

export default {
  name: 'K3kPolicyProjectSelect',

  emits: ['update:errors', 'update:projectAnnotation'],

  props: {
    mode: {
      type:    String,
      default: _CREATE
    },

    policy: {
      type:    Object,
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

  // TODO nb read projects from annotation when editing
  // then confirm all ns in those projects are annotated
  created() {
    // this.registerBeforeHook(this.annotateNamespaces, 'annotate-namespaces');
    this.registerBeforeHook(this.annotateAndSaveAllNamespaces, 'annotate-namespaces');

    this.findSelectedProjects();
  },

  components: { LabeledSelect, ProjectSaveStatus },

  data() {
    return {
      selectedProjects:    [],
      // TODO nb remove
      nsStatusesByProject: {
        testid: {
          willSave:        [{ name: 'abc' }, { name: 'def' }],
          saved:           [{ name: 'abc' }],
          permissionError:   false,
          serverError:     false
        },
        testid2: {
          willSave:        [{ name: 'abc1' }, { name: 'def1' }],
          saved:           [{ name: 'abc1' }],
          permissionError:   true,
          serverError:     false
        },
        testid3: {
          willSave:        [{ name: 'abc3' }, { name: 'def3' }],
          saved:           [{ name: 'abc3' }, { name: 'def3' }],
          permissionError:   false,
          serverError:     true
        },
      }
    };
  },

  methods: {

    findSelectedProjects() {
      // TODO nb look at policy annotation to find what projects assigned via ui previously
      // confirm all ns in the project ARE annotated
    },

    annotateNamespaces(project) {
      const out = [];

      const namespaces = project.namespaces || [];

      namespaces.forEach((ns) => {
        ns.setAnnotation(ANNOTATIONS.POLICY, this.policy?.metadata?.name);
        out.push(ns);
      });

      return out;
    },

    async saveNamespaces(toSave) {
      await Promise.all(toSave.map((ns) => {
        return new Promise((resolve, reject) => {
          const projectId = ns?.metadata?.labels[PROJECT];

          if (!this.nsStatusesByProject[projectId]) {
            this.nsStatusesByProject[projectId] = {
              willSave: [ns],
              saved:    [],
              errors:   []
            };
          }

          this.nsStatusesByProject[projectId].willSave.push(ns.id);

          return ns.save()
            .then((res) => {
              this.nsStatusesByProject[projectId].saved.push(ns.id);

              return resolve(!!res);
            })
            .catch((e) => {
              // TODO nb permissionError and serverError
              this.nsStatusesByProject[projectId].errors.push(e);

              return reject(e);
            });
        });
      }));
    },

    async annotateAndSaveAllNamespaces() {
      this.savingNamespaces = true;
      this.projectStatuses = {};
      const toSave = [];

      // TODO nb also annotate projects?
      // TODO nb annotate policy with all selected project id
      this.selectedProjects.forEach((p) => {
        toSave.push(...this.annotateNamespaces(p));
      });

      await this.saveNamespaces(toSave);

      this.savingNamespaces = false;
    },

    async retryProject(projectId) {
      const project = this.$store.getters['management/byId']({ type: MANAGEMENT.PROJECT, id: projectId });

      if (project) {
        const nsToSave = this.annotateNamespaces(project);

        await this.saveNamespaces(nsToSave);
      }
    }
  },

  computed: {
    ...mapGetters({ t: 'i18n/t' }),

    allProjects() {
      return this.$store.getters['management/all']({ type: MANAGEMENT.PROJECT });
    },

    projectOptions() {
      return this.allProjects.map((p) => {
        return {
          label: p?.spec?.displayName,
          value: p
        };
      });
    },

    namespacesByProject() {
      return (this.allProjects || []).reduce((all, p) => {
        all[p.id] = p.namespaces || [];

        return all;
      }, {});
    },

    hasErrors() {
      return Object.keys(this.statuses || {}).find((p) => !!(this.statuses[p] || []).find((res) => res.__status !== 200));
    },
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
    <ProjectSaveStatus
      :project-statuses="nsStatusesByProject"
      @retry-project="retryProject"
    />
  </div>
</template>

<style lang="scss" scoped>
.project-select :deep().vs__selected {
    width:fit-content !important;
}
</style>
