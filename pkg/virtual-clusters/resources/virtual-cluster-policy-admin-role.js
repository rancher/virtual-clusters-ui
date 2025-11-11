export default {
  apiVersion:  'management.cattle.io/v3',
  kind:        'RoleTemplate',
  context:     'cluster',
  displayName: 'Virtual Cluster Policy Admin',
  metadata:    {
    name:   'virtual-cluster-policy-admin',
    labels: { 'management.cattle.io/ui-role-name': 'virtual-cluster-policy-admin' }
  },
  rules: [
    {
      apiGroups: [
        'k3k.io'
      ],
      resources: [
        'VirtualClusterPolicies'
      ],
      verbs: [
        '*'
      ]
    },
    {
      apiGroups: [
        'catalog.cattle.io'
      ],
      resources: [
        'Apps'
      ],
      verbs: [
        'get'
      ]
    }
  ]
};
