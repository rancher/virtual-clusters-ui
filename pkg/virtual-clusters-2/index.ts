import { importTypes } from '@rancher/auto-import';
import { IPlugin, ModelExtensionConstructor, PanelLocation } from '@shell/core/types';
import { k3kProvisioner } from './provisioner';
import { VClusterModelExtension } from './model-extension/provisioning.cattle.io.cluster';
import virtualClusterRouting from './routes'



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

  this breaks the extension
}