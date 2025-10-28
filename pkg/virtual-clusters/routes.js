import Dashboard from './pages/index.vue';

const routes = [
  {
    name:      'c-cluster-virtualclusters',
    path:      '/c/:cluster/virtualclusters',
    component: Dashboard,
  },
];

export default routes;
