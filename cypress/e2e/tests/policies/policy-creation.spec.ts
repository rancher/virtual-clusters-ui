import PolicyFormPo, { NotAllowedSection } from '../../po/policy-form.po';
import VirtualClusterPolicyCreatePagePo from '../../po/virtual-cluster-policy-create.po';
import { HOST_CLUSTER } from '../../utils/provisioning';
import {
  apiRequest, clusterIdByName, deleteResource, k3kIsInstalled, loginAsAdmin, uninstallK3k, K3K_POLICY_TYPE
} from '../../utils/rancher-api';
import {
  createLabelledStorageClasses, deleteLabelledStorageClasses, LabelledStorageClasses, RUN_LABEL, TIER_LABEL, ZONE_LABEL
} from '../../utils/storage-classes';

describe('policy creation', { tags: ['@adminUser'] }, () => {
  let hostClusterId = '';
  let removeK3k = false;

  before(() => {
    loginAsAdmin();

    clusterIdByName(HOST_CLUSTER).then((id) => {
      hostClusterId = id;

      k3kIsInstalled(id).then((installed) => {
        removeK3k = !installed;
      });
      cy.installK3k(id);
    });
  });

  beforeEach(() => {
    loginAsAdmin();
  });

  describe('storage class synchronization', () => {
    let classes = {} as LabelledStorageClasses;
    const createdPolicies: string[] = [];

    before(() => {
      loginAsAdmin();

      cy.createE2EResourceName('sc-policy').then((run: string) => {
        createLabelledStorageClasses(hostClusterId, run).then((created) => {
          classes = created;
        });
      });
    });

    after('remove storage classes and policies', () => {
      if (!hostClusterId) {
        return;
      }

      createdPolicies.forEach((name) => deleteResource(`k8s/clusters/${ hostClusterId }/v1`, K3K_POLICY_TYPE, name));

      if (classes.run) {
        deleteLabelledStorageClasses(hostClusterId, classes);
      }
    });

    it('syncs every storage class by default', () => {
      const sync = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId).storageClassSync();

      sync.enabledCheckbox().isChecked();
      sync.checkAllClassesSelected();
      sync.labelSelector().should('not.exist');
    });

    it('offers no storage class selection once sync is cleared', () => {
      const sync = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId).storageClassSync();

      sync.enabledCheckbox().set();

      sync.enabledCheckbox().isNotChecked();
      sync.modeButtons().self().should('not.exist');
    });

    it('lists every storage class while the subset has no labels', () => {
      const sync = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId).storageClassSync();

      sync.selectSubset();

      sync.checkMatchedClassesInclude([classes.fastA, classes.fastB, classes.slowA]);
      sync.labelSelector().contains(/All \d+ storage classes selected/).should('exist');
    });

    it('lists the storage classes that have a label', () => {
      const sync = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId).storageClassSync();

      sync.selectSubset();
      sync.setLabel(0, RUN_LABEL, classes.run);

      sync.checkMatchedClasses([classes.fastA, classes.fastB, classes.slowA]);
      sync.matchedCount().should('contain', '3');
      sync.labelSelector().should('contain', '3 storage classes selected');
    });

    it('lists only the storage classes that have every label', () => {
      const sync = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId).storageClassSync();

      sync.selectSubset();
      sync.setLabel(0, RUN_LABEL, classes.run);
      sync.setLabel(1, TIER_LABEL, 'fast');

      sync.checkMatchedClasses([classes.fastA, classes.fastB]);
      sync.labelSelector().should('contain', '2 storage classes selected');

      sync.setLabel(2, ZONE_LABEL, 'a');

      sync.checkMatchedClasses([classes.fastA]);
      sync.labelSelector().should('contain', '1 storage class selected');
    });

    it('lists no storage classes when none has the labels', () => {
      const sync = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId).storageClassSync();

      sync.selectSubset();
      sync.setLabel(0, RUN_LABEL, classes.run);
      sync.setLabel(1, TIER_LABEL, 'fast');

      sync.checkMatchedClasses([classes.fastA, classes.fastB]);

      sync.replaceLabelValue(1, 'none');

      sync.checkMatchedClasses([]);
      sync.labelSelector().should('contain', '0 storage classes selected');
    });

    it('saves the label selector in the policy', () => {
      const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);
      const sync = page.storageClassSync();

      const name = `${ classes.run }-${ Cypress.currentRetry }`;
      const selector = { [RUN_LABEL]: classes.run, [TIER_LABEL]: 'fast' };

      createdPolicies.push(name);
      cy.intercept({ method: 'POST', url: new RegExp(`/k8s/clusters/${ hostClusterId }/v1/k3k\\.io\\.virtualclusterpolic(y|ies)(\\?|$)`) }).as('createPolicy');

      page.nameNsDescription().name().set(name);
      sync.selectSubset();
      sync.setLabel(0, RUN_LABEL, classes.run);
      sync.setLabel(1, TIER_LABEL, 'fast');
      sync.checkMatchedClasses([classes.fastA, classes.fastB]);

      page.save().click();

      cy.wait('@createPolicy').then(({ request, response }) => {
        expect(response?.statusCode, 'create policy').to.eq(201);
        expect(request.body?.spec?.sync?.storageClasses, 'storage class sync in the request').to.deep.equal({ enabled: true, selector });
      });

      apiRequest({ url: `/k8s/clusters/${ hostClusterId }/v1/${ K3K_POLICY_TYPE }/${ name }` })
        .its('body.spec.sync.storageClasses')
        .should('deep.equal', { enabled: true, selector });
    });
  });

  describe('hcp mode', () => {
    // section titles and an element within it that can be checked for existence. These are test cases
    const HCP_SECTIONS: { section: NotAllowedSection, title: string, controls: (page: PolicyFormPo) => Cypress.Chainable }[] = [
      {
        section: 'synchronization', title: 'Resource Synchronization', controls: (page) => page.storageClassSync().self()
      },
      {
        section: 'security', title: 'Security', controls: (page) => page.podSecuritySelect().self()
      },
      {
        section: 'isolation', title: 'Cluster Isolation', controls: (page) => page.isolationCheckbox().self()
      },
      {
        section: 'agentScheduling', title: 'Agent Scheduling', controls: (page) => page.agentScheduling()
      },
    ];

    // check that the sections DO show something in shared mode
    it('shows the configuration of every section in shared mode', () => {
      const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

      HCP_SECTIONS.forEach(({ section, controls }) => {
        controls(page).should('exist');
        page.notAllowed(section).should('not.exist');
      });
    });

    // check that the sections are hidden in HCP mode, and have valid links to docs
    HCP_SECTIONS.forEach(({ section, title, controls }) => {
      it(`replaces ${ title } with a not available message in hcp mode`, () => {
        const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

        page.selectMode('hcp');
        page.expandSection(title);

        page.notAllowed(section).scrollIntoView().should('be.visible').and('contain', 'Not available in HCP mode');
        controls(page).should('not.exist');
      });

      it(`links the ${ title } message to the hcp mode documentation`, () => {
        const page = VirtualClusterPolicyCreatePagePo.navTo(hostClusterId);

        page.selectMode('hcp');

        page.notAllowed(section).find('a')
          .should('have.attr', 'target', '_blank')
          .and('have.attr', 'rel')
          .and('include', 'noopener');

        page.notAllowed(section).find('a').invoke('attr', 'href').then((href) => {
          const [url, fragment] = `${ href }`.split('#');

          expect(fragment, 'link fragment').to.eq('_hcp_mode');

          cy.request(url).then((resp) => {
            expect(resp.status, `GET ${ url }`).to.eq(200);
            expect(resp.body, `element with id ${ fragment }`).to.include(`id="${ fragment }"`);
          });
        });
      });
    });
  });

  after('clean up', () => {
    if (hostClusterId && removeK3k) {
      uninstallK3k(hostClusterId);
    }
  });
});
