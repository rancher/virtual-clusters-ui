import VirtualClusterDetailPagePo, { HCP_TAB, RELATED_TAB } from '../../po/virtual-cluster-detail.po';
import { NOT_ALLOWED, openCreateForm } from '../../utils/provisioning';
import {
  loginAsAdmin, deleteResource, waitForResource, createVirtualClusterStub, K3K_MODE_ANNOTATION,
  PARENT_CLUSTER_ANNOTATION, K3K_NAMESPACE_ANNOTATION
} from '../../utils/rancher-api';

const CLUSTER_NAMESPACE = 'fleet-default';

describe('HCP mode', () => {
  beforeEach(() => {
    // TODO nb https://github.com/rancher/virtual-clusters-ui/issues/205
    loginAsAdmin();
  });

  it('marks agent and sync configuration as not available', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.modeOption('hcp').click();
    cruK3k.self().contains(NOT_ALLOWED).should('exist');
  });

  // k3k provisions no agent pods in hcp mode
  it('replaces the agent configuration with a not available message', { tags: ['@adminUser', '@standardUser'] }, () => {
    const cruK3k = openCreateForm();

    cruK3k.modeOption('hcp').click();

    cruK3k.expandSection('Agents').within(() => {
      cy.contains(NOT_ALLOWED).should('be.visible');
      cy.contains('Number of Agent Pods').should('not.exist');
      cy.contains('Agent Pod Environment Variables').should('not.exist');
    });
  });

  /**
   * The HCP tab is gated on the mode annotation alone, so clusters with no k3k cluster
   * behind them are enough. Without parent cluster and namespace annotations the tab
   * makes no requests and renders its registration section with a warning.
   */
  describe('HCP detail tab', { tags: ['@adminUser'] }, () => {
    const created: string[] = [];
    let hcpCluster: VirtualClusterDetailPagePo;
    let sharedCluster: VirtualClusterDetailPagePo;

    // the detail page needs the management cluster rancher creates for the provisioning cluster
    function createStub(context: string, mode: string): Cypress.Chainable<string> {
      return cy.createE2EResourceName(context).then((name: string) => {
        createVirtualClusterStub(name, CLUSTER_NAMESPACE, { [K3K_MODE_ANNOTATION]: mode });
        created.push(name);

        waitForResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, name, (resp) => !!resp.body?.status?.clusterName)
          .should('eq', true);

        return cy.wrap(name);
      });
    }

    before(() => {
      loginAsAdmin();

      createStub('vc-hcp', 'hcp').then((name) => {
        hcpCluster = new VirtualClusterDetailPagePo('_', name);
      });
      createStub('vc-shared', 'shared').then((name) => {
        sharedCluster = new VirtualClusterDetailPagePo('_', name);
      });
    });

    it('opens the HCP tab by default and reflects it in the url', () => {
      hcpCluster.goTo();

      hcpCluster.tab(HCP_TAB).should('have.class', 'active');
      cy.location('hash').should('eq', `#${ HCP_TAB }`);
      hcpCluster.hcpRegistrationTitle().should('be.visible');
    });

    it('updates the url hash when switching tabs', () => {
      hcpCluster.goTo();
      hcpCluster.tab(HCP_TAB).should('have.class', 'active');

      hcpCluster.tabButton(RELATED_TAB).click();
      cy.location('hash').should('eq', `#${ RELATED_TAB }`);
      hcpCluster.tab(HCP_TAB).should('not.have.class', 'active');

      hcpCluster.tabButton(HCP_TAB).click();
      cy.location('hash').should('eq', `#${ HCP_TAB }`);
      hcpCluster.tab(HCP_TAB).should('have.class', 'active');
    });

    // deep links are the behaviour under test, so these load the url directly
    it('opens the tab named in the url hash', () => {
      hcpCluster.goTo(undefined, RELATED_TAB);
      hcpCluster.tab(RELATED_TAB).should('have.class', 'active');
      hcpCluster.tab(HCP_TAB).should('not.have.class', 'active');

      hcpCluster.goTo(undefined, HCP_TAB);
      hcpCluster.tab(HCP_TAB).should('have.class', 'active');
      hcpCluster.hcpRegistrationTitle().should('be.visible');
    });

    it('does not add the HCP tab to virtual clusters in other modes', () => {
      sharedCluster.goTo();

      sharedCluster.tab(RELATED_TAB).should('exist');
      sharedCluster.tab(HCP_TAB).should('not.exist');
    });

    after('clean up', () => {
      created.forEach((name) => deleteResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, name));
    });
  });

  /**
   * HcpDetailTab builds the registration command from five GETs against the host cluster.
   * The cluster points at a host that does not exist and each test stubs those responses,
   * covering each source of the server address in the order HcpDetailTab tries them.
   */
  describe('HCP registration server url', { tags: ['@adminUser'] }, () => {
    const STUB_HOST = 'c-m-hcpstub';
    const STUB_NAMESPACE = 'k3k-hcpstub';
    const TOKEN = 'stub-token';
    const SAN_HOST = 'vc.example.com';
    const NODE_PORT = 31443;

    let clusterName = '';
    let detailPage: VirtualClusterDetailPagePo;

    const serverPort = {
      name: 'k3s-server-port', port: 6443, nodePort: NODE_PORT
    };

    function nodePortService(ports: Record<string, any>[] = [serverPort]) {
      return { spec: { type: 'NodePort', ports }, status: {} };
    }

    function node(name: string, internalIp: string) {
      return {
        metadata: { name, labels: {} },
        status:   {
          addresses: [
            { type: 'InternalIP', address: internalIp },
            { type: 'ExternalIP', address: '198.51.100.1' },
          ],
          nodeInfo: { kubeletVersion: 'v1.33.1+k3s1' }
        }
      };
    }

    function pod(nodeName: string, role: string) {
      return { metadata: { labels: { cluster: clusterName, role } }, spec: { nodeName } };
    }

    // the k3k controller sets status.hostVersion on its first reconcile; the tab withholds the command without a version
    // listStatus fails the node and pod lists, as for a user who cannot list them
    function stubHostResources({
      service, k3kCluster = {}, nodes = [], pods = [], listStatus
    }: { service?: any, k3kCluster?: any, nodes?: any[], pods?: any[], listStatus?: number }) {
      const base = `/k8s/clusters/${ STUB_HOST }/v1`;
      const reconciledCluster = { ...k3kCluster, status: { hostVersion: 'v1.33.1', ...k3kCluster.status } };
      const listResponse = (items: any[]) => (listStatus ? { statusCode: listStatus, body: { message: 'forbidden' } } : { body: { data: items } });

      cy.intercept({ method: 'GET', pathname: `${ base }/secrets/${ STUB_NAMESPACE }/k3k-${ clusterName }-token` }, { body: { data: { token: btoa(TOKEN) } } });
      cy.intercept({ method: 'GET', pathname: `${ base }/k3k.io.clusters/${ STUB_NAMESPACE }/${ clusterName }` }, { body: reconciledCluster });
      cy.intercept({ method: 'GET', pathname: `${ base }/services/${ STUB_NAMESPACE }/k3k-${ clusterName }-service` }, service ? { body: service } : { statusCode: 404, body: {} });
      cy.intercept({ method: 'GET', pathname: `${ base }/nodes` }, listResponse(nodes));
      cy.intercept({ method: 'GET', pathname: `${ base }/pods/${ STUB_NAMESPACE }` }, listResponse(pods));
    }

    function expectInstallVersion(version: string) {
      detailPage.goTo(undefined, HCP_TAB);
      detailPage.registrationCommand().should('contain', `INSTALL_K3S_VERSION=${ version } `);
    }

    function expectServerUrl(url: string) {
      detailPage.goTo(undefined, HCP_TAB);
      detailPage.registrationCommand()
        .should('contain', `K3S_URL=${ url }`)
        .and('contain', `K3S_TOKEN=${ TOKEN }`);
    }

    function expectNoServerUrl() {
      detailPage.goTo(undefined, HCP_TAB);
      detailPage.noServerAddressWarning().should('be.visible');
      detailPage.registrationCommand().should('not.exist');
    }

    before(() => {
      loginAsAdmin();

      cy.createE2EResourceName('vc-hcp-url').then((name: string) => {
        clusterName = name;
        detailPage = new VirtualClusterDetailPagePo('_', name);

        createVirtualClusterStub(name, CLUSTER_NAMESPACE, {
          [K3K_MODE_ANNOTATION]:       'hcp',
          [PARENT_CLUSTER_ANNOTATION]: STUB_HOST,
          [K3K_NAMESPACE_ANNOTATION]:  STUB_NAMESPACE,
        });

        waitForResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, name, (resp) => !!resp.body?.status?.clusterName)
          .should('eq', true);
      });
    });

    it('uses the load balancer ip, ahead of the tls sans', () => {
      stubHostResources({
        service:    { spec: { type: 'LoadBalancer', ports: [serverPort] }, status: { loadBalancer: { ingress: [{ ip: '203.0.113.10' }] } } },
        k3kCluster: { spec: { tlsSANs: [SAN_HOST] } },
      });

      expectServerUrl('https://203.0.113.10:6443');
    });

    it('uses the load balancer hostname when it has no ip', () => {
      stubHostResources({ service: { spec: { type: 'LoadBalancer', ports: [serverPort] }, status: { loadBalancer: { ingress: [{ hostname: 'lb.example.com' }] } } } });

      expectServerUrl('https://lb.example.com:6443');
    });

    it('uses the first non-loopback tls san with the node port', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: { tlsSANs: ['127.0.0.1', 'localhost', SAN_HOST] } },
      });

      expectServerUrl(`https://${ SAN_HOST }:${ NODE_PORT }`);
    });

    it('falls back to the port serving 6443 when no port is named k3s-server-port', () => {
      stubHostResources({
        service:    { spec: { type: 'ClusterIP', ports: [{ name: 'https', port: 6443 }] }, status: {} },
        k3kCluster: { spec: { tlsSANs: [SAN_HOST] } },
      });

      expectServerUrl(`https://${ SAN_HOST }:6443`);
    });

    it('uses the internal ip of the node running a server pod when it is in the certificate', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: {}, status: { tlsSANs: ['10.0.0.5', '10.0.0.6'] } },
        nodes:      [node('node-a', '10.0.0.5'), node('node-b', '10.0.0.6')],
        // only the node running the server answers on the node port
        pods:       [pod('node-b', 'agent'), pod('node-a', 'server')],
      });

      expectServerUrl(`https://10.0.0.5:${ NODE_PORT }`);
    });

    it('does not use a server node whose address is not in the certificate', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: {}, status: { tlsSANs: ['10.0.0.6'] } },
        nodes:      [node('node-a', '10.0.0.5'), node('node-b', '10.0.0.6')],
        pods:       [pod('node-a', 'server')],
      });

      expectNoServerUrl();
    });

    it('warns when no service serves the k3s supervisor', () => {
      stubHostResources({
        // a missing Service means k3k has not created it yet, so the tab waits rather than warns
        service: nodePortService([{
          name: 'k3s-etcd-port', port: 2379, nodePort: 32379
        }]),
        k3kCluster: { spec: { tlsSANs: [SAN_HOST] } },
      });

      expectNoServerUrl();
    });

    it('brackets an ipv6 tls san', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: { tlsSANs: ['2001:db8::10'] } },
      });

      expectServerUrl(`https://[2001:db8::10]:${ NODE_PORT }`);
    });

    it('brackets an ipv6 load balancer address', () => {
      stubHostResources({ service: { spec: { type: 'LoadBalancer', ports: [serverPort] }, status: { loadBalancer: { ingress: [{ ip: '2001:db8::20' }] } } } });

      expectServerUrl('https://[2001:db8::20]:6443');
    });

    it('installs the k3s version set on the virtual cluster', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: { tlsSANs: [SAN_HOST], version: 'v1.32.5-k3s1' } },
      });

      expectInstallVersion('v1.32.5+k3s1');
    });

    // k3k resolves an unset version from status.hostVersion, not from the host's distribution
    it('installs the host version k3k recorded when the virtual cluster sets none', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: { tlsSANs: [SAN_HOST] }, status: { hostVersion: 'v1.31.4' } },
      });

      expectInstallVersion('v1.31.4+k3s1');
    });

    it('withholds the command until k3k has recorded a version', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: { tlsSANs: [SAN_HOST] }, status: { hostVersion: '' } },
      });

      detailPage.goTo(undefined, HCP_TAB);
      detailPage.pendingMessage().should('be.visible');
      detailPage.registrationCommand().should('not.exist');
    });

    it('builds the command from a tls san when the host nodes cannot be listed', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: { tlsSANs: [SAN_HOST] } },
        listStatus: 403,
      });

      expectServerUrl(`https://${ SAN_HOST }:${ NODE_PORT }`);
    });

    it('keeps the registration section when the host nodes cannot be listed', () => {
      stubHostResources({
        service:    nodePortService(),
        k3kCluster: { spec: {}, status: { tlsSANs: ['10.0.0.5'] } },
        listStatus: 403,
      });

      expectNoServerUrl();
      detailPage.hcpRegistrationTitle().should('be.visible');
    });

    after('clean up', () => {
      if (clusterName) {
        deleteResource('v1', `provisioning.cattle.io.clusters/${ CLUSTER_NAMESPACE }`, clusterName);
      }
    });
  });
});
