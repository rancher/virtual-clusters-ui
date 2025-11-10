import { importTypes } from '@rancher/auto-import';
import { IPlugin, ModelExtensionConstructor, PanelLocation } from '@shell/core/types';
import { k3kProvisioner } from './provisioner';
import { VClusterModelExtension } from './model-extension/provisioning.cattle.io.cluster';
import virtualClusterRouting from './routes'
import virtualClusterAdminRole from './resources/virtual-cluster-admin-role.json'
import virtualClusterPolicyAdminRole from './resources/virtual-cluster-policy-admin-role.json'
import { MANAGEMENT, SCHEMA } from '@shell/config/types';
import versions from '@shell/utils/versions';
import { isRancherPrime } from '@shell/config/version';

const createRoleIfNotFound = async (roleTemplate: any, store:any)=>{
  const rolesMatching = await store.dispatch('management/findLabelSelector', {type: MANAGEMENT.ROLE_TEMPLATE, matching:  {labelSelector: {matchLabels:roleTemplate.metadata.labels }}}) || []

  if(!rolesMatching.length){
    const newRole = await store.dispatch('management/create', {type: MANAGEMENT.ROLE_TEMPLATE, ...roleTemplate})
    const norman = await newRole.norman

    norman.labels = roleTemplate.metadata.labels
    norman.save()
  }
}


// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

 // Add Vue Routes
  plugin.addRoutes(virtualClusterRouting);

  // Register a model extension for the provisioning model
  plugin.addModelExtension('provisioning.cattle.io.cluster', VClusterModelExtension as unknown as ModelExtensionConstructor);

  plugin.addProduct(require('./config/k3k-management-product'));
  plugin.addProduct(require('./config/k3k-explorer-product'));


  // Register custom provisioner object
  plugin.register('provisioner', k3kProvisioner.ID, k3kProvisioner);

  // Built-in icon
  plugin.metadata.icon = require('./assets/icon-k3k.svg');

  plugin.addNavHooks(undefined, undefined, undefined, async(store: any)=>{
    try{
      await versions.fetch({ store: store });

      if(isRancherPrime()){
        await store.dispatch('management/loadSchemas')
        await store.dispatch('rancher/loadSchemas')
        const roleSchema = store.getters['management/byId'](SCHEMA, MANAGEMENT.ROLE_TEMPLATE )


        if((roleSchema?.resourceMethods||[]).find((verb: string) => ['PUT', 'blocked-PUT'].includes(verb))){
          await store.dispatch('management/findAll', {type: MANAGEMENT.ROLE_TEMPLATE})
          createRoleIfNotFound(virtualClusterAdminRole, store)
          createRoleIfNotFound(virtualClusterPolicyAdminRole, store)
        }
      }
    } catch(e) {
      console.error(e)
    }
  })
}
