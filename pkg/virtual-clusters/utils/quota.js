export const GENERIC_QUOTA_TYPES = [
  {
    value:          'count/configmaps',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.countConfigMaps',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'limits.cpu',
    inputExponent:  -1,
    baseUnitKey:    'suffix.cpus',
    labelKey:       'resourceQuota.limitsCpu',
    placeholderKey: 'resourceQuota.projectLimit.cpuPlaceholder'
  },
  {
    value:          'limits.memory',
    inputExponent:  2,
    increment:      1024,
    labelKey:       'resourceQuota.limitsMemory',
    placeholderKey: 'resourceQuota.projectLimit.memoryPlaceholder'
  },
  {
    value:          'count/persistentvolumeclaims',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.countPersistentVolumeClaims',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'count/pods',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.countPods',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'count/replicationcontrollers',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.countReplicationControllers',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'requests.cpu',
    inputExponent:  -1,
    baseUnitKey:    'suffix.cpus',
    labelKey:       'resourceQuota.requestsCpu',
    placeholderKey: 'resourceQuota.projectLimit.cpuPlaceholder'
  },
  {
    value:          'requests.memory',
    inputExponent:  2,
    increment:      1024,
    labelKey:       'resourceQuota.requestsMemory',
    placeholderKey: 'resourceQuota.projectLimit.memoryPlaceholder'
  },
  {
    value:          'requests.storage',
    units:          'storage',
    inputExponent:  2,
    increment:      1024,
    labelKey:       'resourceQuota.requestsStorage',
    placeholderKey: 'resourceQuota.projectLimit.storagePlaceholder'
  },
  {
    value:          'requests.nvidia.com/gpu',
    units:          'unitless',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.requestsNvidiaComGpu',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'count/secrets',
    units:          'unitless',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.countSecrets',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'count/services',
    units:          'unitless',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.countServices',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'services.loadbalancers',
    units:          'unitless',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.servicesLoadBalancers',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
  {
    value:          'services.nodeports',
    units:          'unitless',
    inputExponent:  0,
    baseUnit:       '',
    labelKey:       'resourceQuota.generic.servicesNodePorts',
    placeholderKey: 'resourceQuota.projectLimit.unitlessPlaceholder'
  },
];
