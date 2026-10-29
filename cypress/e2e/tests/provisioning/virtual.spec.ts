import { NOT_ALLOWED, openCreateForm } from '../../utils/provisioning';
import { loginAsAdmin } from '../../utils/rancher-api';

describe('virtual mode', () => {
  beforeEach(() => {
    // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
    loginAsAdmin();
  });

  it('marks agent and sync configuration as not available', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.modeOption('virtual').click();
    cruK3k.self().contains(NOT_ALLOWED).should('exist');
  });

  // k3k runs spec.agents agent pods in virtual mode, with spec.agentEnvs
  it('offers the agent pod count and agent env vars', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.modeOption('virtual').click();

    cruK3k.expandSection('Agents').within(() => {
      cy.contains('Number of Agent Pods').should('be.visible');
      cy.contains('Agent Pod Environment Variables').should('be.visible');
      cy.contains(NOT_ALLOWED).should('not.exist');
    });
  });
});
