import ComponentPo from '@rancher/cypress/e2e/po/components/component.po';
import ButtonGroupPo from '@rancher/cypress/e2e/po/components/button-group.po';
import CheckboxInputPo from '@rancher/cypress/e2e/po/components/checkbox-input.po';
import KeyValuePo from '@rancher/cypress/e2e/po/components/key-value.po';

const ALL_CLASSES_LABEL = 'All storage classes';
const SUBSET_LABEL = 'Select a subset';
const ADD_LABEL_LABEL = 'Add label';

/**
 * pkg/virtual-clusters/components/Sync/StorageClasses.vue
 * rendered by the policy form, so the same section is found on the create page and in the policy drawer
 */
export default class StorageClassSyncPo extends ComponentPo {
  constructor() {
    super('[data-testid="k3k-sync-storage-classes"]');
  }

  enabledCheckbox(): CheckboxInputPo {
    return new CheckboxInputPo('[data-testid="k3k-sync-storage-classes-enabled"]', this.self());
  }

  modeButtons(): ButtonGroupPo {
    return new ButtonGroupPo('[data-testid="k3k-sync-storage-classes-mode"]', this.self());
  }

  selectAllClasses(): Cypress.Chainable {
    return this.modeButtons().set(ALL_CLASSES_LABEL);
  }

  selectSubset(): Cypress.Chainable {
    return this.modeButtons().set(SUBSET_LABEL);
  }

  checkAllClassesSelected(): Cypress.Chainable {
    return this.modeButtons().self().find('[data-testid="button-group-child-0"]').should('have.class', 'role-secondary');
  }


  labelSelector(): Cypress.Chainable {
    return this.self().find('[data-testid="k3k-sync-storage-class-selector"]');
  }

  labels(): KeyValuePo {
    return new KeyValuePo('[data-testid="k3k-sync-storage-class-labels"]', this.self());
  }

  // RcKeyValue renders a value as TextAreaAutoGrow (value-multiline) by default, and as an input otherwise
  private static valueFieldSelector(index: number): string {
    return `[data-testid="kv-item-value-${ index }"] [data-testid="value-multiline"], [data-testid="kv-item-value-${ index }"] [data-testid="input-kv-item-value-${ index }"]`;
  }

  // RcKeyValue starts with one empty row, later rows are added with its add button
  setLabel(index: number, key: string, value: string): Cypress.Chainable {
    const labels = this.labels();

    if (index > 0) {
      labels.addButton(ADD_LABEL_LABEL).click();
    }

    labels.self().find(`[data-testid="input-kv-item-key-${ index }"]`).type(key);

    return labels.self().find(StorageClassSyncPo.valueFieldSelector(index)).type(value);
  }

  replaceLabelValue(index: number, value: string): Cypress.Chainable {
    return this.labels().self().find(StorageClassSyncPo.valueFieldSelector(index)).clear()
      .type(value);
  }

  checkLabels(pairs: [string, string][]): Cypress.Chainable {
    return this.labels().self().should(($labels: any) => {
      const found = $labels.find('[data-testid^="input-kv-item-key-"]').toArray().map((keyInput: HTMLInputElement, i: number) => {
        const valueField = $labels.find(StorageClassSyncPo.valueFieldSelector(i))[0] as HTMLInputElement | HTMLTextAreaElement | undefined;

        return [keyInput.value, valueField?.value || ''];
      });

      expect(found).to.deep.include.members(pairs);
    });
  }

  matched(): Cypress.Chainable {
    return this.labelSelector().find('[data-testid="k3k-sync-storage-classes-matched"]');
  }

  // verifies the loading spinner is gone as well
  private matchedNames($matched: any): string[] {
    expect($matched.find('[data-testid="k3k-sync-storage-classes-loading"]'), 'match request settled').to.have.length(0);

    return $matched.find('[data-testid="k3k-sync-storage-class-match"]').toArray().map((el: HTMLElement) => el.textContent?.trim() || '');
  }

  checkMatchedClasses(names: string[]): Cypress.Chainable {
    return this.matched().should(($matched) => {
      expect([...this.matchedNames($matched)].sort()).to.deep.equal([...names].sort());
    });
  }

  checkMatchedClassesInclude(names: string[]): Cypress.Chainable {
    return this.matched().should(($matched) => {
      expect(this.matchedNames($matched)).to.include.members(names);
    });
  }

  matchedCount(): Cypress.Chainable {
    return this.matched().find('[data-testid="rc-counter-badge"]');
  }
}
