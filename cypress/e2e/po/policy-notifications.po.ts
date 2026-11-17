import NotificationsCenterPo from '@rancher/cypress/e2e/po/components/notification-center.po';
import { NotificationPo } from '@rancher/cypress/e2e/po/components/notification.po';

export class PolicyNotificationPo extends NotificationPo {
  message(): Cypress.Chainable {
    return this.self().find('.message');
  }
}

//  
// notification center entries added when a policy is assigned to or unassigned from projects
// pkg/virtual-clusters/edit/k3k.io.virtualclusterpolicy/Projects.vue
// the notification center keeps entries from earlier runs, so an entry is found by its title and the policy name in its message
export default class PolicyNotificationsPo extends NotificationsCenterPo {
  notification(title: string, policyName: string): PolicyNotificationPo {
    return new PolicyNotificationPo(() => this.self()
      .find('[data-testid="notifications-center-item"]')
      .filter((_, el) => {
        return el.querySelector('.item-title')?.textContent?.trim() === title &&
          !!el.querySelector('.message')?.textContent?.includes(policyName);
      }));
  }
}
