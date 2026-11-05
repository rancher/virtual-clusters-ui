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
});
