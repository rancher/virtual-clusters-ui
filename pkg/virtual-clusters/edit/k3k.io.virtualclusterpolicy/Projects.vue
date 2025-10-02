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
    this.registerBeforeHook(this.annotateNamespaces, 'annotate-namespaces');
    this.findSelectedProjects();
  },

  components: { LabeledSelect, ProjectSaveStatus },

  data() {
    return {
      selectedProjects:    [],
      // TODO nb remove
      nsStatusesByProject: {
        testid: {
          willSave: [{ name: 'abc' }, { name: 'def' }],
          saved:    [{ name: 'abc' }],
          errors:   []
        },
        testid2: {
          willSave: [{ name: 'abc1' }, { name: 'def1' }],
          saved:    [{ name: 'abc1' }],
          errors:   ['blah blah blah']
        }
      }
    };
  },

  methods: {
    async annotateNamespaces() {
      this.savingNamespaces = true;
      this.projectStatuses = {};
      const toSave = [];

      // TODO nb also annotate projects?
      // TODO nb annotate policy with all selected project id
      this.selectedProjects.forEach((p) => {
        const namespaces = p.namespaces || [];

        namespaces.forEach((ns) => {
          ns.setAnnotation(ANNOTATIONS.POLICY, this.policy?.metadata?.name);
          toSave.push(ns);
        }
        );
      });

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
              this.nsStatusesByProject[projectId].saved++;

              return resolve(!!res);
            })
            .catch((e) => {
              this.nsStatusesByProject[projectId].errors.push(e);

              return reject(e);
            });
        });
      }));

      this.savingNamespaces = false;
    },

    findSelectedProjects() {
      // TODO nb look at policy annotation to find what projects assigned via ui previously
      // confirm all ns in the project ARE annotated
    }
  },

  computed: {
    ...mapGetters({ t: 'i18n/t' }),

    namespacesToSave() {

    },

    allProjects() {
      return this.$store.getters['management/all']({ type: MANAGEMENT.PROJECT });
    },

    // TODO nb filter system projects?
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
    <ProjectSaveStatus :project-statuses="nsStatusesByProject" />
  </div>
</template>

<style lang="scss" scoped>
.project-select :deep().vs__selected {
    width:fit-content !important;
}
</style>
