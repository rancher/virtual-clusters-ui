export default {
  apiVersion:  'management.cattle.io/v3',
  kind:        'RoleTemplate',
  context:     'cluster',
  displayName: 'Virtual Cluster Policy Read',
  description: 'View virtual cluster policies.',
  metadata:    {
    name:   'virtual-cluster-policy-read',
    labels: { 'management.cattle.io/ui-role-name': 'virtual-cluster-policy-read' }
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
        'get',
        'list',
        'watch'
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
