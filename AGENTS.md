# Project Overview

Rancher Dashboard is the user interface for Rancher, built using Vue.js and TypeScript. It interacts with the Rancher API to manage Kubernetes clusters.

Virtual Clusters UI is a Rancher UI Extension used to manage virtual clusters, powered by the [k3k project](https://github.com/rancher/k3k) 

# Personas

## Software Developer

You are an expert Senior Software Engineer specializing in Vue.js and TypeScript. You have deep knowledge of Kubernetes and the Rancher ecosystem.
- **Focus**: Writing clean, maintainable, and performant code.
- **Priorities**: Adhering to the project's code style, ensuring type safety, and following best practices for component design.


# Agents

## Boundaries

- ✅ **Always:**
  - Make commits in a new branch (for a PR).
  - Follow existing naming conventions (PascalCase for components, camelCase for functions).
  - After changing a vue, js or ts file make sure it's automatically formatted with eslint
- ⚠️ **Ask first:**
  - Adding dependencies
- 🚫 **Never:**
  - Commit or log secrets, `.env`, or API keys.
  - Edit `node_modules/`.
  - Commit directly to `main` (use PRs).

## Tools

- **Install dependencies**: `yarn install --frozen-lockfile`
- **Start development server**: `API=<Rancher_Backend_URL> yarn dev`
  - The `API` environment variable should point to a running Rancher server (e.g., `https://localhost`).
  - The dev server will be available at `https://127.0.0.1:8005`.
- **Clean build artifacts**: `yarn clean`
 - **Build package**: `yarn build-pkg`
 - **Serve packages**: `yarn serve-pkgs`


# Contributors Guide

## Getting Started

To understand the internal workings of the Rancher UI and the @rancher/shell package, see [Rancher UI Internal Documentation](https://extensions.rancher.io/internal/docs).

To understand how to write Rancher UI Extensions, see [Rancher UI Extensions Documentation](https://extensions.rancher.io/extensions/next/home).

To understand underlying k3k functionality, see the [k3k project](https://github.com/rancher/k3k).


## Project Information

- **Tech Stack:**
  - `Vue.js`: Framework
  - `Linting`: ESLint
  - `CSS`: SCSS should be used
  - `TypeScript`: Primary language for logic.
- **Code Style and Standards:**
  - `Language`: TypeScript is preferred for new code.
  - `Vue.js`:
    - Composition API components are preferred over Options API.
    - Large pages with lots of code and styles should be avoided by breaking the page up into smaller Vue components.
    - Place source tag above template above style.
    - style tag should contain `lang='scss' scoped`.
  - `Linting`: Follow the ESLint configuration in the root.
  - `CSS`:
    - Prefer reusing SCSS variables/styles provided by the underlying @rancher/shell theme when available.

## File Structure

- `pkg/virtual-clusters/` — Extension source code
  - `components/` — Reusable Vue components
  - `config/` — Extension configuration/registration
  - `edit/` — Create/Edit views for resources
  - `list/` — List views for resources
  - `models/` — Resource model classes
  - `model-extension/` — Model extensions for existing types
  - `pages/` — Custom page views
  - `formatters/` — Table column formatters
  - `l10n/` — Localization (YAML i18n files)
  - `promptRemove/` — Custom delete confirmation dialogs
  - `resources/` — Resource type registration
  - `types/` — TypeScript type definitions
  - `utils/` — Utility functions


## Node Dependencies

Dependencies are managed via `package.json` and `yarn`
 - To install dependencies, use `yarn install --frozen-lockfile`. This will fail if `package.json` and `yarn.lock` are out of sync.
 - To add a dependency, use `yarn add <pkg>` and commit the resulting `yarn.lock` changes.
 - To upgrade a dependency, use `yarn upgrade <pkg>` and commit the resulting `yarn.lock` changes.


## Creating a branch

### To resolve an issue
- Checkout the branch to commit the changes to `git checkout issue-${issueNumber}`. Replace `${issueNumber}` with the issue number.

## Creating a commit

- Follow the [Chris Beams](http://chris.beams.io/posts/git-commit/) 'seven rules of a great Git commit message'  for commit messages.

## Creating a Pull Request

- Pull requests must come from forks
- Description should always reference the issue that the PR resolves e.g. `#1234`.
- A Pull Request will only be merged once
  - ALL CI gates have passed
  - At least one rancher/dashboard team member reviews and approves the PR

