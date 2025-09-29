import { importTypes } from '@rancher/auto-import';
import { IPlugin, ModelExtensionConstructor } from '@shell/core/types';
import { k3kProvisioner } from './provisioner';
import { VClusterModelExtension } from './model-extension/provisioning.cattle.io.cluster';



// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register a model extension for the provisioning model
  plugin.addModelExtension('provisioning.cattle.io.cluster', VClusterModelExtension as unknown as ModelExtensionConstructor);

  plugin.addProduct(require('./config/k3k-management-product'));
  plugin.addProduct(require('./config/k3k-explorer-product'));


  // Register custom provisioner object
  plugin.register('provisioner', k3kProvisioner.ID, k3kProvisioner);

  // Built-in icon
  plugin.metadata.icon = require('./assets/icon-virtual-clusters.svg');
}
