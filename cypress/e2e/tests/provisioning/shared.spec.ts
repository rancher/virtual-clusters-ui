import { NOT_ALLOWED, openCreateForm } from '../../utils/provisioning';
import { loginAsAdmin } from '../../utils/rancher-api';

describe('shared mode', () => {
  beforeEach(() => {
    // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
    loginAsAdmin();
  });

  it('allows agent and sync configuration', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    // shared is the default, so leave it first for the notice to have something to disappear from
    cruK3k.modeOption('virtual').click();
    cruK3k.self().contains(NOT_ALLOWED).should('exist');

    cruK3k.modeOption('shared').click();
    cruK3k.self().contains(NOT_ALLOWED).should('not.exist');
  });
});
