import {
  apiRequest, createNamespace, createProject, createVirtualClusterPolicy, deleteResource,
  K3K_POLICY_TYPE, POLICY_NAME_LABEL, POLICY_PROJECTS_ANNOTATION
} from './rancher-api';

export const NAMESPACES_PER_PROJECT = 12;

export interface AssignmentProject {
  // v3 id, c-m-xxx:p-xxx
  id: string;
  //  
  // steve id, c-m-xxx/p-xxx, the form the extension stores in the policy annotation
  steveId: string;
  displayName: string;
  namespaces: string[];
}

export interface AssignmentFixture {
  clusterId: string;
  a: AssignmentProject;
  b: AssignmentProject;
  c: AssignmentProject;
  //  
  // a project with no namespaces, which the policy form does not offer
  empty: AssignmentProject;
}

const RETRIES = 10;

function hostPrefix(clusterId: string) {
  return `k8s/clusters/${ clusterId }/v1`;
}

function namespaceUrl(clusterId: string, name: string) {
  return `/${ hostPrefix(clusterId) }/namespaces/${ name }`;
}

function projectUrl(project: AssignmentProject) {
  return `/v1/management.cattle.io.projects/${ project.steveId }`;
}

function fixtureProjects(fixture: AssignmentFixture): AssignmentProject[] {
  return [fixture.a, fixture.b, fixture.c, fixture.empty].filter((p) => !!p);
}

export function fixtureNamespaces(fixture: AssignmentFixture): string[] {
  return fixtureProjects(fixture).reduce((all, p) => all.concat(p.namespaces), [] as string[]);
}

//  
// path of the namespace PUTs the policy form sends, for cy.intercept
export function namespacePath(clusterId: string, names: string[]): RegExp {
  return new RegExp(`^/${ hostPrefix(clusterId) }/namespaces/(${ names.join('|') })$`);
}

//  
// path of the norman project PUT the policy form sends when it labels a project
// the id separator may be url encoded
export function projectPath(project: AssignmentProject): RegExp {
  const [clusterId, projectName] = project.id.split(':');

  return new RegExp(`^/v3/projects/${ clusterId }(:|%3A)${ projectName }$`);
}

function createProjectWithNamespaces(clusterId: string, displayName: string, count: number): Cypress.Chainable<AssignmentProject> {
  return createProject(clusterId, displayName).then((id) => {
    const namespaces = Array.from({ length: count }, (_, i) => `${ displayName }-ns-${ i }`);

    namespaces.forEach((ns) => createNamespace(clusterId, ns, id));

    return cy.wrap({
      id, steveId: id.replace(':', '/'), displayName, namespaces
    });
  });
}

export function createAssignmentFixture(clusterId: string, root: string): Cypress.Chainable<AssignmentFixture> {
  const fixture = { clusterId } as AssignmentFixture;

  (['a', 'b', 'c'] as const).forEach((key) => {
    createProjectWithNamespaces(clusterId, `${ root }-${ key }`, NAMESPACES_PER_PROJECT).then((p) => {
      fixture[key] = p;
    });
  });

  createProjectWithNamespaces(clusterId, `${ root }-empty`, 0).then((p) => {
    fixture.empty = p;
  });

  return cy.wrap(fixture);
}

//  
// steve adds fields that are not part of the kubernetes object
function forUpdate(body: any) {
  const {
    id, type, links, actions, ...object
  } = body;
  const {
    state, relationships, fields, ...metadata
  } = object.metadata || {};

  return { ...object, metadata };
}

function setPolicyLabel(url: string, policyName: string | null, attempts = 3): Cypress.Chainable {
  return apiRequest({ url }).then((resp) => {
    const labels = { ...(resp.body.metadata?.labels || {}) };

    if ((labels[POLICY_NAME_LABEL] || null) === policyName) {
      return cy.wrap(null, { log: false });
    }

    if (policyName) {
      labels[POLICY_NAME_LABEL] = policyName;
    } else {
      delete labels[POLICY_NAME_LABEL];
    }

    const body = forUpdate(resp.body);

    body.metadata.labels = labels;

    return apiRequest({
      method: 'PUT', url, body, failOnStatusCode: false
    }).then((put) => {
      //  
      // rancher controllers update new namespaces and projects soon after they are created
      if (put.status === 409 && attempts > 1) {
        return setPolicyLabel(url, policyName, attempts - 1);
      }

      expect(put.status, `set ${ POLICY_NAME_LABEL }=${ policyName } on ${ url }`).to.eq(200);
    });
  });
}

export function setNamespacePolicyLabel(clusterId: string, name: string, policyName: string | null) {
  return setPolicyLabel(namespaceUrl(clusterId, name), policyName);
}

export function setProjectPolicyLabel(project: AssignmentProject, policyName: string | null) {
  return setPolicyLabel(projectUrl(project), policyName);
}

/**
 *  
 * the state the policy form leaves after it assigns `policyName` to `projects`
 * namespaces in `unassigned` keep no label, as when their save failed
 */
export function assignThroughApi(fixture: AssignmentFixture, policyName: string, projects: AssignmentProject[], unassigned: string[] = []) {
  createVirtualClusterPolicy(fixture.clusterId, policyName, projects.map((p) => p.id));

  projects.forEach((p) => {
    setProjectPolicyLabel(p, policyName);
    p.namespaces
      .filter((ns) => !unassigned.includes(ns))
      .forEach((ns) => setNamespacePolicyLabel(fixture.clusterId, ns, policyName));
  });
}

function listNamespaces(clusterId: string): Cypress.Chainable<any[]> {
  return apiRequest({ url: `/${ hostPrefix(clusterId) }/namespaces` }).then((resp) => resp.body?.data || []);
}

//  
// remove the policy label from every project and namespace in the fixture
// delete policies only after this: k3k removes the label from a deleted policy's namespaces, which conflicts with these updates
export function clearAssignments(fixture: AssignmentFixture) {
  fixtureProjects(fixture).forEach((p) => setProjectPolicyLabel(p, null));

  const names = fixtureNamespaces(fixture);

  return listNamespaces(fixture.clusterId).then((all) => {
    all
      .filter((ns) => names.includes(ns.metadata?.name) && !!ns.metadata?.labels?.[POLICY_NAME_LABEL])
      .forEach((ns) => setNamespacePolicyLabel(fixture.clusterId, ns.metadata.name, null));
  });
}

export function deletePolicies(clusterId: string, names: string[]) {
  names.forEach((name) => deleteResource(hostPrefix(clusterId), K3K_POLICY_TYPE, name));
}

// best effort
export function deleteAssignmentFixture(fixture: AssignmentFixture) {
  fixtureProjects(fixture).forEach((p) => {
    p.namespaces.forEach((ns) => deleteResource(hostPrefix(fixture.clusterId), 'namespaces', ns));
    deleteResource('v3', 'projects', p.id);
  });
}

/**
 *  
 * poll until every namespace in `namespaces` has `policyName` as its policy label, or no label when `policyName` is undefined
 * the namespace list is served from steve's cache, which can trail a save by a moment
 */
export function checkNamespacePolicyLabels(clusterId: string, namespaces: string[], policyName: string | undefined) {
  const mismatched = (all: any[]) => {
    const labels: Record<string, string | undefined> = {};

    all.forEach((ns) => {
      labels[ns.metadata?.name] = ns.metadata?.labels?.[POLICY_NAME_LABEL];
    });

    return namespaces.filter((name) => labels[name] !== policyName);
  };

  const check = (remaining: number): Cypress.Chainable => {
    return listNamespaces(clusterId).then((all) => {
      const wrong = mismatched(all);

      if (!wrong.length || remaining <= 1) {
        expect(wrong, `namespaces whose policy label is not ${ policyName }`).to.deep.eq([]);

        return;
      }
      cy.wait(1000); // eslint-disable-line cypress/no-unnecessary-waiting

      return check(remaining - 1);
    });
  };

  return check(RETRIES);
}

export function checkProjectPolicyLabel(project: AssignmentProject, policyName: string | undefined) {
  return apiRequest({ url: projectUrl(project) }).then((resp) => {
    expect(resp.body?.metadata?.labels?.[POLICY_NAME_LABEL], `policy label of project ${ project.displayName }`).to.eq(policyName);
  });
}

// the projects the policy annotation lists, in steve id form
export function checkPolicyProjects(clusterId: string, policyName: string, projects: AssignmentProject[]) {
  return apiRequest({ url: `/${ hostPrefix(clusterId) }/${ K3K_POLICY_TYPE }/${ policyName }` }).then((resp) => {
    const assignedTo = `${ resp.body?.metadata?.annotations?.[POLICY_PROJECTS_ANNOTATION] || '' }`;
    const ids = assignedTo.split(',').map((id) => id.trim()).filter((id) => !!id);

    expect(ids, `${ POLICY_PROJECTS_ANNOTATION } of ${ policyName }`).to.have.members(projects.map((p) => p.steveId));
  });
}
