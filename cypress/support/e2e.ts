import '@rancher/cypress/support/e2e';

import './commands/k3k';

const minorOf = (version?: string): number[] | undefined => version?.match(/^"?v?(\d+)\.(\d+)/)?.slice(1, 3).map(Number);

/**
 * The release welcome modal (shell/dialog/ReleaseWelcomeDialog.vue) opens on first login and covers the page under test.
 * Report it as read for the running minor version.
 * Intercepts are cleared before every test, so it is registered in `before` too, for specs that log in there
 * cy.getRancherVersion reads the csrf cookie the login command stores, so it fails before the first login
 */
const hideReleaseWelcome = () => {
  cy.request({ url: `${ Cypress.env('api') }/rancherversion`, headers: { Accept: 'application/json' } }).then(({ body }) => {
    const { Version } = typeof body === 'string' ? JSON.parse(body) : body;

    cy.intercept('GET', '/v1/userpreferences*', (req) => {
      req.continue((res) => {
        const prefs = res.body?.data?.[0]?.data;
        const running = minorOf(Version);

        if (!prefs || !running) {
          return;
        }

        const read = minorOf(prefs['read-whatsnew']);

        if (!read || read[0] < running[0] || (read[0] === running[0] && read[1] < running[1])) {
          prefs['read-whatsnew'] = `"${ running[0] }.${ running[1] }"`;
        }
      });
    });
  });
};

before(hideReleaseWelcome);
beforeEach(hideReleaseWelcome);
