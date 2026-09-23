export interface AwsCloudCredentialBlueprintInput {
  name: string;
  namespace: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

export interface AwsMachineConfigBlueprintInput {
  name: string;
  namespace: string;
  region: string;
  instanceType: string;
  vpcId: string;
  zone: string;
}

export interface AwsProvisioningClusterBlueprintInput {
  name: string;
  namespace: string;
  cloudCredentialSecretName: string;
  machineConfigName: string;
  kubernetesVersion: string;
}

export function awsCloudCredentialBlueprint({
  name,
  namespace,
  region,
  accessKey,
  secretKey,
}: AwsCloudCredentialBlueprintInput) {
  return {
    type:                      'provisioning.cattle.io/cloud-credential',
    metadata:                  { generateName: 'cc-', namespace },
    _name:                     name,
    annotations:               { 'provisioning.cattle.io/driver': 'aws' },
    amazonec2credentialConfig: {
      defaultRegion: region,
      accessKey,
      secretKey,
    },
    _type: 'provisioning.cattle.io/cloud-credential',
    name,
  };
}

export function awsMachineConfigBlueprint({
  name,
  namespace,
  region,
  instanceType,
  vpcId,
  zone,
}: AwsMachineConfigBlueprintInput) {
  return {
    instanceType,
    metadata: {
      annotations:  {},
      generateName: `nc-${ name }-pool1-`,
      labels:       {},
      namespace,
    },
    region,
    securityGroup:         ['rancher-nodes'],
    securityGroupReadonly: false,
    subnetId:              null,
    vpcId,
    zone,
    type:                  'rke-machine-config.cattle.io.amazonec2config',
  };
}

export function awsProvisioningClusterBlueprint({
  name,
  namespace,
  cloudCredentialSecretName,
  machineConfigName,
  kubernetesVersion,
}: AwsProvisioningClusterBlueprintInput) {
  return {
    type:     'provisioning.cattle.io.cluster',
    metadata: {
      namespace,
      name,
      annotations: { 'field.cattle.io/description': `${ name }-description` },
    },
    spec: {
      rkeConfig: {
        chartValues:         { 'rke2-calico': {} },
        machineGlobalConfig: {
          cni:                   'calico',
          'disable-kube-proxy':  false,
          'etcd-expose-metrics': false,
          'ingress-controller':  'ingress-nginx',
        },
        machineSelectorConfig: [{ config: { 'protect-kernel-defaults': false } }],
        etcd:                  {
          disableSnapshots:     false,
          s3:                   null,
          snapshotRetention:    5,
          snapshotScheduleCron: '0 */5 * * *',
        },
        registries:   { configs: {}, mirrors: {} },
        machinePools: [{
          name:                 'pool1',
          etcdRole:             true,
          controlPlaneRole:     true,
          workerRole:           true,
          hostnamePrefix:       '',
          labels:               {},
          quantity:             1,
          unhealthyNodeTimeout: '0m',
          machineConfigRef:     { kind: 'Amazonec2Config', name: machineConfigName },
          drainBeforeDelete:    true,
        }],
      },
      machineSelectorConfig:                                [{ config: {} }],
      kubernetesVersion,
      defaultPodSecurityAdmissionConfigurationTemplateName: '',
      cloudCredentialSecretName,
      localClusterAuthEndpoint:                             {
        enabled: false,
        caCerts: '',
        fqdn:    ''
      },
    },
  };
}
