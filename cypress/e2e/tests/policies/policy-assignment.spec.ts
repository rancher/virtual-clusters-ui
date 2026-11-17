import { LONG_TIMEOUT_OPT } from '@rancher/cypress/support/utils/timeouts';

import PolicyNotificationsPo from '../../po/policy-notifications.po';
import VirtualClusterPolicyCreatePagePo from '../../po/virtual-cluster-policy-create.po';
import VirtualClusterPolicyEditPagePo from '../../po/virtual-cluster-policy-edit.po';
import VirtualClustersPolicyListPagePo from '../../po/virtual-clusters-policy-list.po';
import { HOST_CLUSTER } from '../../utils/provisioning';
import {
  clusterIdByName, createVirtualClusterPolicy, k3kIsInstalled, loginAsAdmin, uninstallK3k
} from '../../utils/rancher-api';
import {
  assignThroughApi, checkNamespacePolicyLabels, checkPolicyProjects, checkProjectPolicyLabel, clearAssignments,
  createAssignmentFixture, deleteAssignmentFixture, deletePolicies, fixtureNamespaces, namespacePath, projectPath,
  setProjectPolicyLabel, AssignmentFixture, AssignmentProject, NAMESPACES_PER_PROJECT as N
} from '../../utils/policy-assignment';

const TITLES = {
  assigned:              'Policy assignment completed',
  assignFailed:          'Policy assignment failed',
  unassigned:            'Policy unassignment completed',
  unassignFailed:        'Policy unassignment failed',
  assignedAndUnassigned: 'Policy assignment/unassignment completed',
  projectsFailed:        'Failed to save some projects',
};

const PARTIALLY_ASSIGNED = 'Policy couldn\'t be applied to some namespaces.';

//  
// the shell only reports the status of a failed request when the response has a body
function errorResponse(statusCode: number) {
  return {
    statusCode,
    body: {
      type: 'error', status: statusCode, message: 'e2e: request rejected'
    }
  };
}

// names of the namespaces in the PUTs an intercept alias recorded
function namespaceNames(calls: any[]): string[] {
  return calls.map((call) => new URL(call.request.url).pathname.split('/').pop() as string);
}

describe('policy assignment', { tags: ['@adminUser'] }, () => {
  let hostClusterId = '';
  let removeK3k = false;
  let root = '';
  let fixture = {} as AssignmentFixture;
  const createdPolicies: string[] = [];

  before(() => {
    loginAsAdmin();

    clusterIdByName(HOST_CLUSTER).then((id) => {
      hostClusterId = id;

      k3kIsInstalled(id).then((installed) => {
        removeK3k = !installed;
      });
      cy.installK3k(id);

      cy.createE2EResourceName('pa').then((name: string) => {
        root = name;

        createAssignmentFixture(id, name).then((created) => {
          fixture = created;
        });
      });
    });
  });

  //  
  // every test starts with no project or namespace of the fixture assigned to a policy
  beforeEach(() => {
    loginAsAdmin();

    if (fixture.clusterId) {
      clearAssignments(fixture).then(() => {
        deletePolicies(hostClusterId, createdPolicies.splice(0));
      });
    }
  });

  function newPolicyName(context: string): string {
    const name = `${ root }-${ context }-${ Cypress.currentRetry }`;

    createdPolicies.push(name);

    return name;
  }

  // saving the policy form returns to the list once every namespace has been saved
  function waitForPolicyList(): VirtualClustersPolicyListPagePo {
    const list = new VirtualClustersPolicyListPagePo(hostClusterId);

    list.waitForListPath(LONG_TIMEOUT_OPT);
    list.waitForList();

    return list;
  }

  function openNotifications(): PolicyNotificationsPo {
    const notifications = new PolicyNotificationsPo();

    notifications.toggle();

    return notifications;
  }

  function createPolicy(name: string, projects: AssignmentProject[]): VirtualClustersPolicyListPagePo {
    const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

    page.nameNsDescription().name().set(name);
    projects.forEach((p) => page.selectProject(p.displayName));
    page.save().click();

    return waitForPolicyList();
  }

  function spyOnNamespaceUpdates(alias: string) {
    cy.intercept({ method: 'PUT', pathname: namespacePath(hostClusterId, fixtureNamespaces(fixture)) }).as(alias);
  }

  describe('project options', () => {
    function optionLabels($options: JQuery<HTMLElement>): string[] { // eslint-disable-line no-undef
      return $options.toArray().map((option) => option.textContent?.trim() || '');
    }

    it('offers only the projects that contain namespaces', () => {
      const {
        a, b, c, empty
      } = fixture;
      const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

      page.projectSelect().toggle();
      page.projectSelect().getOptions().should(($options) => {
        const labels = optionLabels($options);

        expect(labels).to.include.members([a.displayName, b.displayName, c.displayName]);
        expect(labels).not.to.include(empty.displayName);
      });
    });

    it('does not offer a project that is assigned to another policy', () => {
      const { a, b, c } = fixture;
      const other = newPolicyName('other');

      createVirtualClusterPolicy(hostClusterId, other, c.id);
      setProjectPolicyLabel(c, other);

      const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

      page.projectSelect().toggle();
      page.projectSelect().getOptions().should(($options) => {
        const labels = optionLabels($options);

        expect(labels).to.include.members([a.displayName, b.displayName]);
        expect(labels).not.to.include(c.displayName);
      });
    });

    it('offers a project that is assigned to a policy that no longer exists', () => {
      const { c } = fixture;

      setProjectPolicyLabel(c, `${ root }-deleted`);

      const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

      page.projectSelect().toggle();
      page.projectSelect().getOptions().should(($options) => {
        expect(optionLabels($options)).to.include(c.displayName);
      });
    });
  });

  describe('assigning a new policy', () => {
    it('assigns the policy to every namespace in the selected projects', () => {
      const { a, b, c } = fixture;
      const name = newPolicyName('all');
      const assigned = [...a.namespaces, ...b.namespaces];

      spyOnNamespaceUpdates('updateNamespace');

      createPolicy(name, [a, b]);

      cy.get('@updateNamespace.all').should((calls: any) => {
        expect(namespaceNames(calls)).to.have.members(assigned);
      });
      openNotifications().notification(TITLES.assigned, name).message()
        .should('contain', `${ name } successfully assigned to ${ assigned.length } namespaces.`);

      checkNamespacePolicyLabels(hostClusterId, assigned, name);
      checkNamespacePolicyLabels(hostClusterId, c.namespaces, undefined);
      checkProjectPolicyLabel(a, name);
      checkProjectPolicyLabel(b, name);
      checkProjectPolicyLabel(c, undefined);
      checkPolicyProjects(hostClusterId, name, [a, b]);
    });

    it('reports the namespaces that could not be assigned', () => {
      const { a, b } = fixture;
      const name = newPolicyName('rejected');
      const failed = a.namespaces.slice(0, 3);

      cy.intercept({ method: 'PUT', pathname: namespacePath(hostClusterId, failed) }, errorResponse(409)).as('rejectNamespace');

      const list = createPolicy(name, [a, b]);

      cy.get('@rejectNamespace.all').should('have.length', failed.length);
      list.stateDescription(name).should('contain', PARTIALLY_ASSIGNED);

      const notification = openNotifications().notification(TITLES.assignFailed, name);

      notification.message().should('contain', `There were errors assigning some namespaces to ${ name }.`);
      notification.primaryActionButton().should('contain', 'Edit Policy');

      checkNamespacePolicyLabels(hostClusterId, [...a.namespaces.slice(3), ...b.namespaces], name);
      checkNamespacePolicyLabels(hostClusterId, failed, undefined);
    });

    it('reports a namespace as failed when it is unchanged after a server error', () => {
      const { a } = fixture;
      const name = newPolicyName('unsaved');
      const failed = a.namespaces.slice(0, 2);

      cy.intercept({ method: 'PUT', pathname: namespacePath(hostClusterId, failed) }, errorResponse(500)).as('rejectNamespace');
      //  
      // after a 500 the extension reads the namespace again to see whether the label was saved
      cy.intercept({ method: 'GET', pathname: namespacePath(hostClusterId, failed) }).as('verifyNamespace');

      createPolicy(name, [a]);

      cy.get('@verifyNamespace.all').should((calls: any) => {
        expect(namespaceNames(calls)).to.have.members(failed);
      });
      openNotifications().notification(TITLES.assignFailed, name).message()
        .should('contain', `There were errors assigning some namespaces to ${ name }.`);

      checkNamespacePolicyLabels(hostClusterId, a.namespaces.slice(2), name);
      checkNamespacePolicyLabels(hostClusterId, failed, undefined);
    });

    it('reports a namespace as assigned when it was saved despite a server error', () => {
      const { a } = fixture;
      const name = newPolicyName('saved');
      const saved = a.namespaces.slice(0, 2);

      cy.intercept({ method: 'PUT', pathname: namespacePath(hostClusterId, saved) }, (req) => {
        req.continue((res) => {
          //  
          // the delay lets steve's cache see the saved label before the extension reads the namespace again
          res.setDelay(1000);
          res.send(errorResponse(500));
        });
      }).as('saveThenFail');
      cy.intercept({ method: 'GET', pathname: namespacePath(hostClusterId, saved) }).as('verifyNamespace');

      createPolicy(name, [a]);

      cy.get('@verifyNamespace.all').should((calls: any) => {
        expect(namespaceNames(calls)).to.have.members(saved);
      });
      openNotifications().notification(TITLES.assigned, name).message()
        .should('contain', `${ name } successfully assigned to ${ N } namespaces.`);

      checkNamespacePolicyLabels(hostClusterId, a.namespaces, name);
    });

    it('reports the projects that could not be labelled', () => {
      const { a, b } = fixture;
      const name = newPolicyName('project');

      cy.intercept({ method: 'PUT', pathname: projectPath(a) }, errorResponse(500)).as('rejectProject');

      createPolicy(name, [a, b]);

      cy.get('@rejectProject.all').should('have.length', 1);

      const notifications = openNotifications();

      notifications.notification(TITLES.projectsFailed, name).message()
        .should('contain', `There were errors updating some projects assigned to ${ name }.`);
      //  
      // namespaces are saved after the projects, whether or not the projects were saved
      notifications.notification(TITLES.assigned, name).message()
        .should('contain', `${ name } successfully assigned to ${ 2 * N } namespaces.`);

      checkProjectPolicyLabel(a, undefined);
      checkProjectPolicyLabel(b, name);
      checkNamespacePolicyLabels(hostClusterId, [...a.namespaces, ...b.namespaces], name);
    });
  });

  describe('a partially assigned policy', () => {
    it('lists the project that has unassigned namespaces when the policy is edited', () => {
      const { a, b } = fixture;
      const name = newPolicyName('partial');

      assignThroughApi(fixture, name, [a, b], a.namespaces.slice(0, 3));

      const page = VirtualClusterPolicyEditPagePo.navTo(hostClusterId, name);
      const table = page.projectStatusTable();

      table.namespaceCount(a.steveId).should('contain', `${ N - 3 }/${ N }`);
      table.errorMessage(a.steveId).should('contain', 'There were connection errors while editing some namespaces in this project');
      table.icon(a.steveId, 'error').should('exist');
      table.row(b.steveId).should('not.exist');
      page.projectStatusBanner().banner().should('contain', 'Policy assignment has failed in some projects.');
    });

    it('assigns only the remaining namespaces when the policy is saved again', () => {
      const { a, b } = fixture;
      const name = newPolicyName('resave');
      const unassigned = a.namespaces.slice(0, 3);

      assignThroughApi(fixture, name, [a, b], unassigned);
      spyOnNamespaceUpdates('updateNamespace');

      const page = VirtualClusterPolicyEditPagePo.navTo(hostClusterId, name);

      page.projectStatusTable().row(a.steveId).should('exist');
      page.save().click();
      waitForPolicyList();

      cy.get('@updateNamespace.all').should((calls: any) => {
        expect(namespaceNames(calls)).to.have.members(unassigned);
      });
      openNotifications().notification(TITLES.assigned, name).message()
        .should('contain', `${ name } successfully assigned to ${ unassigned.length } namespaces.`);

      checkNamespacePolicyLabels(hostClusterId, [...a.namespaces, ...b.namespaces], name);
    });

    it('assigns the namespaces that failed after following the failure notification to the edit page', () => {
      const { a, b } = fixture;
      const name = newPolicyName('retry');
      const failed = b.namespaces.slice(-2);

      //  
      // fail only the first save of each namespace, so the second save succeeds
      cy.intercept({
        method: 'PUT', pathname: namespacePath(hostClusterId, failed), times: failed.length
      }, errorResponse(409)).as('rejectNamespace');

      createPolicy(name, [a, b]);
      cy.get('@rejectNamespace.all').should('have.length', failed.length);

      openNotifications().notification(TITLES.assignFailed, name).primaryActionButton().click();

      const page = new VirtualClusterPolicyEditPagePo(hostClusterId, name);

      page.waitForPage();
      page.projectStatusTable().namespaceCount(b.steveId).should('contain', `${ N - failed.length }/${ N }`);

      spyOnNamespaceUpdates('retryNamespace');
      page.save().click();
      waitForPolicyList();

      cy.get('@retryNamespace.all').should((calls: any) => {
        expect(namespaceNames(calls)).to.have.members(failed);
      });
      openNotifications().notification(TITLES.assigned, name).message()
        .should('contain', `${ name } successfully assigned to ${ failed.length } namespaces.`);

      checkNamespacePolicyLabels(hostClusterId, [...a.namespaces, ...b.namespaces], name);
    });
  });

  describe('unassigning a policy', () => {
    it('removes the policy from every namespace in a deselected project', () => {
      const { a, b } = fixture;
      const name = newPolicyName('remove');

      assignThroughApi(fixture, name, [a, b]);
      spyOnNamespaceUpdates('updateNamespace');

      const page = VirtualClusterPolicyEditPagePo.navTo(hostClusterId, name);
      const table = page.projectStatusTable();

      page.deselectProject(b.displayName);
      table.icon(b.steveId, 'unassign').should('exist');
      table.namespaceCount(b.steveId).should('contain', `${ N }/${ N }`);
      table.row(a.steveId).should('not.exist');

      page.save().click();
      waitForPolicyList();

      cy.get('@updateNamespace.all').should((calls: any) => {
        expect(namespaceNames(calls)).to.have.members(b.namespaces);
      });
      openNotifications().notification(TITLES.unassigned, name).message()
        .should('contain', `${ name } successfully unassigned from ${ N } namespaces.`);

      checkNamespacePolicyLabels(hostClusterId, a.namespaces, name);
      checkNamespacePolicyLabels(hostClusterId, b.namespaces, undefined);
      checkProjectPolicyLabel(a, name);
      checkProjectPolicyLabel(b, undefined);
      checkPolicyProjects(hostClusterId, name, [a]);
    });

    it('keeps the policy on the namespaces that could not be unassigned', () => {
      const { a } = fixture;
      const name = newPolicyName('keep');
      const failed = a.namespaces.slice(0, 3);

      assignThroughApi(fixture, name, [a]);
      cy.intercept({ method: 'PUT', pathname: namespacePath(hostClusterId, failed) }, errorResponse(409)).as('rejectNamespace');

      const page = VirtualClusterPolicyEditPagePo.navTo(hostClusterId, name);

      page.deselectProject(a.displayName);
      page.projectStatusTable().icon(a.steveId, 'unassign').should('exist');
      page.save().click();
      waitForPolicyList();

      cy.get('@rejectNamespace.all').should('have.length', failed.length);
      openNotifications().notification(TITLES.unassignFailed, name).message()
        .should('contain', `There were errors unassigning some namespaces from ${ name }.`);

      checkNamespacePolicyLabels(hostClusterId, failed, name);
      checkNamespacePolicyLabels(hostClusterId, a.namespaces.slice(3), undefined);
      //  
      // the project keeps its label, which is how the edit form finds it to retry the unassignment
      checkProjectPolicyLabel(a, name);

      const retry = VirtualClusterPolicyEditPagePo.navTo(hostClusterId, name);

      retry.projectStatusTable().icon(a.steveId, 'unassign').should('exist');
      retry.projectStatusTable().namespaceCount(a.steveId).should('contain', `${ failed.length }/${ N }`);
    });

    it('assigns one project and unassigns another in one save', () => {
      const { a, b } = fixture;
      const name = newPolicyName('swap');

      assignThroughApi(fixture, name, [a]);

      const page = VirtualClusterPolicyEditPagePo.navTo(hostClusterId, name);

      page.deselectProject(a.displayName);
      page.selectProject(b.displayName);
      page.save().click();
      waitForPolicyList();

      openNotifications().notification(TITLES.assignedAndUnassigned, name).message()
        .should('contain', `${ name } successfully assigned to ${ N } namespaces and unassigned from ${ N } namespaces.`);

      checkNamespacePolicyLabels(hostClusterId, a.namespaces, undefined);
      checkNamespacePolicyLabels(hostClusterId, b.namespaces, name);
      checkProjectPolicyLabel(a, undefined);
      checkProjectPolicyLabel(b, name);
      checkPolicyProjects(hostClusterId, name, [b]);
    });
  });

  after('remove the policies, namespaces and projects', () => {
    if (fixture.clusterId) {
      deletePolicies(hostClusterId, createdPolicies);
      deleteAssignmentFixture(fixture);
    }

    if (hostClusterId && removeK3k) {
      uninstallK3k(hostClusterId);
    }
  });
});
