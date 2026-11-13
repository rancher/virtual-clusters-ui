import ComponentPo from '@rancher/cypress/e2e/po/components/component.po';

export type ProjectStatusIcon = 'unassign' | 'error' | 'assigned' | 'pending' | 'retry';

// pkg/virtual-clusters/edit/k3k.io.virtualclusterpolicy/ProjectStatusTable.vue
//  
// the policy form lists the projects that are partially assigned or are being unassigned
// rows are keyed by the steve project id, c-m-xxx/p-xxx
export default class ProjectStatusTablePo extends ComponentPo {
  constructor(parent: Cypress.Chainable) {
    super('[data-testid="k3k-policy-project-status"]', parent);
  }

  row(projectId: string): Cypress.Chainable {
    return this.self().find(`[data-testid="k3k-policy-project-status-${ projectId }"]`);
  }

  // 'assigned/total' namespaces
  namespaceCount(projectId: string): Cypress.Chainable {
    return this.row(projectId).find('[data-testid="k3k-policy-project-count"]');
  }

  errorMessage(projectId: string): Cypress.Chainable {
    return this.row(projectId).find('[data-testid="k3k-policy-project-error"]');
  }

  icon(projectId: string, icon: ProjectStatusIcon): Cypress.Chainable {
    return this.row(projectId).find(`[data-testid="k3k-policy-project-icon-${ icon }"]`);
  }
}
