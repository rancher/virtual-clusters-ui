# Virtual Cluster UI Extension
Rancher extension used to provision clusters with [k3k](https://github.com/rancher/k3k/)

Requires Rancher 2.12.x

## Running for Development
This is what you probably want to get started.
```bash
# Install dependencies
yarn install --frozen-lockfile

# For development, serve with hot reload at https://localhost:8005
# using the endpoint for your Rancher API
API=https://your-rancher yarn dev
# or put the variable into a .env file
# Goto https://localhost:8005
```

## Running e2e tests locally
The tests run against the dev server. Set `TEST_BASE_URL`, `TEST_USERNAME`, `TEST_PASSWORD` and `TEST_HOST_CLUSTER` (the downstream cluster that hosts the virtual clusters) in `.env`.

The tests send API requests to `API`, which must be the dev server too: the session cookie belongs to the dev server. If `.env` sets `API` to your Rancher for `yarn dev`, override it for the test run.
```bash
yarn dev
API=https://localhost:8005 yarn cy:run   # or yarn cy:open
```

### Code coverage
Coverage is off unless both the dev server and Cypress run with `TEST_INSTRUMENT=true`. The dev server then instruments the extension code, and Cypress collects coverage from each test.
```bash
yarn dev:coverage
API=https://localhost:8005 yarn cy:run:coverage   # or yarn cy:open:coverage
```
The report for `pkg/virtual-clusters` is written to `coverage/e2e`; open `coverage/e2e/index.html`. The report options are in `.nycrc`.

## Updating @shell package
This is about updating the @shell package which is the base from rancher/dashboard
```bash
# Update
yarn create @rancher/update
```

## Building the extension for production
Bump the app version on `package.json` file, then run:
```bash
# Build for production
./scripts/publish -g 
# add flag -f if you need to overwrite an existing version


# If you need to test the built extension
yarn serve-pkgs
```
