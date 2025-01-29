import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';
import { k3kProvisioner } from './provisioner';
import { VClusterModelExtension } from './model-extension/provisioning.cattle.io.cluster';



// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register a model extension for the provisioning model
  plugin.addModelExtension('provisioning.cattle.io.cluster', VClusterModelExtension);

  plugin.addProduct(require('./product'));


    // Register custom provisioner object
    plugin.register('provisioner', k3kProvisioner.ID, k3kProvisioner);
}
