import { createStorageClass, deleteResource, STORAGE_CLASS_TYPE } from './rancher-api';

// generate unique storage class names for each test run
export const RUN_LABEL = 'e2e.virtual-clusters/run';
export const TIER_LABEL = 'e2e.virtual-clusters/tier';
export const ZONE_LABEL = 'e2e.virtual-clusters/zone';

export interface LabelledStorageClasses {
  run: string;
  fastA: string;
  fastB: string;
  slowA: string;
}

// used to validate the label selector requests
export function createLabelledStorageClasses(clusterId: string, run: string): Cypress.Chainable<LabelledStorageClasses> {
  const classes: LabelledStorageClasses = {
    run,
    fastA: `${ run }-fast-a`,
    fastB: `${ run }-fast-b`,
    slowA: `${ run }-slow-a`,
  };

  createStorageClass(clusterId, classes.fastA, {
    [RUN_LABEL]: run, [TIER_LABEL]: 'fast', [ZONE_LABEL]: 'a'
  });
  createStorageClass(clusterId, classes.fastB, {
    [RUN_LABEL]: run, [TIER_LABEL]: 'fast', [ZONE_LABEL]: 'b'
  });
  createStorageClass(clusterId, classes.slowA, {
    [RUN_LABEL]: run, [TIER_LABEL]: 'slow', [ZONE_LABEL]: 'a'
  });

  return cy.wrap(classes, { log: false });
}

export function deleteLabelledStorageClasses(clusterId: string, classes: LabelledStorageClasses) {
  [classes.fastA, classes.fastB, classes.slowA].forEach((name) => {
    deleteResource(`k8s/clusters/${ clusterId }/v1`, `${ STORAGE_CLASS_TYPE }es`, name);
  });
}
