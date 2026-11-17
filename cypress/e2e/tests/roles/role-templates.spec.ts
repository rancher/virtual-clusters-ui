import HomePagePo from '@rancher/cypress/e2e/po/pages/home.po';

import { loginAsAdmin } from '../../utils/rancher-api';

// labels in pkg/virtual-clusters/resources/*-role.js
const UI_ROLE_NAME_LABEL = 'management.cattle.io/ui-role-name';
const UI_ROLE_NAMES = ['virtual-cluster-admin', 'virtual-cluster-policy-read'];

describe('virtual cluster role templates', { tags: ['@adminUser'] }, () => {
  it('creates every missing role template when the extension loads', () => {
    // CI creates these roles before any tests run, so here we intercept and hide that result to test the extension's role-creation logic
    cy.intercept({ method: 'GET', pathname: '/v1/management.cattle.io.roletemplates' }, (req) => {
      if (decodeURIComponent(req.url).includes(UI_ROLE_NAME_LABEL)) {
        req.reply({
          type: 'collection', resourceType: 'management.cattle.io.roletemplate', count: 0, pages: 0, data: []
        });
      }
    });


    // intercept the attempts to create role templates & leave the server state unchanged
    cy.intercept({ method: 'POST', pathname: '/v3/roletemplates' }, (req) => {
      const uiRoleName = req.body?.labels?.[UI_ROLE_NAME_LABEL] || 'unknown';

      req.reply(201, {
        ...req.body, id: `rt-e2e-${ uiRoleName }`, type: 'roleTemplate'
      });
    }).as('createRoleTemplate');

    loginAsAdmin();


    // full page load - extension checks for roles once per load
    HomePagePo.goTo();

    cy.get('@createRoleTemplate.all', { timeout: 20000 }).should((calls: any[]) => {
      const created = calls.map((c) => c.request.body?.labels?.[UI_ROLE_NAME_LABEL]);

      expect(created).to.include.members(UI_ROLE_NAMES);
    });
  });
});
