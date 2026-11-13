import CruK3kPo from '../../po/cru-k3k.po';
import { HOST_CLUSTER, openCreateForm } from '../../utils/provisioning';
import { loginAsAdmin } from '../../utils/rancher-api';

const PERSISTENCE_SECTION = 'Server Persistence';
const DEFAULT_CLASS = 'e2e-default';
const OTHER_CLASS = 'e2e-other';
const HOST_DEFAULT = 'Host cluster default';

// TODO nb review
// mirrors STORAGE.DEFAULT_STORAGE_CLASS in @shell/config/labels-annotations
const DEFAULT_CLASS_ANNOTATION = 'storageclass.kubernetes.io/is-default-class';

function storageClass(name: string, isDefault = false) {
  return {
    id:          name,
    type:        'storage.k8s.io.storageclass',
    metadata:    { name, annotations: isDefault ? { [DEFAULT_CLASS_ANNOTATION]: 'true' } : {} },
    provisioner: 'rancher.io/local-path'
  };
}

// TODO nb review
// the host cluster's storage classes are replaced, so the tests do not depend on the host
function openPersistenceSection(classes: object[]): CruK3kPo {
  cy.intercept(
    { method: 'GET', url: /\/k8s\/clusters\/[^/]+\/v1\/storage\.k8s\.io\.storageclasses(\?|$)/ },
    { body: { type: 'collection', data: classes } }
  ).as('storageClasses');

  const cruK3k = openCreateForm();

  cruK3k.selectHostCluster(HOST_CLUSTER);
  cy.wait('@storageClasses');
  cruK3k.expandSection(PERSISTENCE_SECTION);

  return cruK3k;
}

describe('server persistence', { tags: ['@adminUser'] }, () => {
  beforeEach(() => {
    loginAsAdmin();
  });

  it('defaults to dynamic persistence with the host cluster default storage class', () => {
    const cruK3k = openPersistenceSection([storageClass(DEFAULT_CLASS, true), storageClass(OTHER_CLASS)]);
    const hostDefaultLabel = `${ HOST_DEFAULT } (${ DEFAULT_CLASS })`;

    cruK3k.persistenceTypeInput('dynamic').should('be.checked');
    cruK3k.storageClassSelect().checkOptionSelected(hostDefaultLabel);
    cruK3k.storageRequestSize().should('be.visible');
    cruK3k.storageNoDefaultBanner().should('not.exist');

    cruK3k.storageClassSelect().toggle();
    cruK3k.storageClassSelect().getOptionsAsStrings().should('deep.equal', [hostDefaultLabel, DEFAULT_CLASS, OTHER_CLASS]);
  });

  it('hides the storage class and size in ephemeral mode', () => {
    const cruK3k = openPersistenceSection([storageClass(DEFAULT_CLASS, true), storageClass(OTHER_CLASS)]);

    cruK3k.storageClassSelect().toggle();
    cruK3k.storageClassSelect().clickOptionWithLabel(OTHER_CLASS);
    cruK3k.storageClassSelect().checkOptionSelected(OTHER_CLASS);

    cruK3k.persistenceTypeOption('ephemeral').click();
    cruK3k.persistenceTypeInput('ephemeral').should('be.checked');
    cruK3k.storageClassSelect().self().should('not.exist');
    cruK3k.storageRequestSize().should('not.exist');

    // TODO nb review
    // the storage class is cleared in ephemeral mode, so dynamic mode starts from the host default
    cruK3k.persistenceTypeOption('dynamic').click();
    cruK3k.storageClassSelect().checkOptionSelected(`${ HOST_DEFAULT } (${ DEFAULT_CLASS })`);
  });

  it('warns when the host cluster has no default storage class', () => {
    const cruK3k = openPersistenceSection([storageClass(OTHER_CLASS)]);

    cruK3k.storageClassSelect().checkOptionSelected(HOST_DEFAULT);
    cruK3k.storageNoDefaultBanner().should('be.visible');

    cruK3k.storageClassSelect().toggle();
    cruK3k.storageClassSelect().clickOptionWithLabel(OTHER_CLASS);
    cruK3k.storageNoDefaultBanner().should('not.exist');
  });
});
