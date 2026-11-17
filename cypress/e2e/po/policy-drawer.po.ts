import PolicyFormPo from './policy-form.po';

// provisioning form's 'view policy configuration' drawer
// contains the virtual cluster policy edit component in view mode
// different network requests as it runs in cluster mgmt context where the host cluster store isn't connected
export default class PolicyDrawerPo extends PolicyFormPo {
  // drawer header title, outside the vcp edit component
  title(): Cypress.Chainable {
    return cy.get('[data-testid="slide-in-panel-component"] [data-testid="k3k-policy-drawer-title"]');
  }
}
