# Review: rancher/virtual-clusters-ui #255 — install k3k no later than ui version

Head reviewed: `e63d081` (identical to local branch `200-supported-version-install`). Base: `upstream/main` `1e125b5`.

## Method

| Source | What was done |
|---|---|
| Diff | Read in full: `git diff upstream/main...e63d081` (13 files) |
| Rancher controller | Read `~/github/rancher/pkg/controllers/dashboard/helm/repo_oci.go` and `repo.go` (`shouldSkip`, `setErrorCondition`, `setCondition`) |
| semver | Ran the selection expressions under semver 7.8.5 (the pinned version) against 11 version lists |
| Lint | `eslint` on the 10 changed source files: clean |
| Browser | `localhost:8005` as `nancy-std`, host `nancy-host` (`c-m-77sf7nh8`), Rancher `v2.16.0-21aa936-head`. Real installs against registry.suse.com, plus `page.route` stubs equivalent to `stubK3kInstallRequests` |
| CI | Public check-runs API at time of writing: `@standardUser` success, `@adminUser` in progress |

Not done: no cypress run locally; the `data-testid` inside `v-clean-html` strings was not checked in the browser (local-cluster and virtual-cluster notices were not visited).

## Summary

Version selection is correct for every list tested, and the real install works from both entry points. Three behaviour problems were found, two reproduced and one traced in the controller source:

1. The landing page shows none of the new error messages (reproduced).
2. The "not processed" poll window expired before Rancher processed a spec change, in 1 of 3 samples (reproduced once).
3. A processed `False` condition with an unchanged spec cannot recover by clicking again (traced, not reproduced).

## Findings

### 1. Landing page drops every install error message — reproduced

`pkg/virtual-clusters/pages/index.vue:152-157` mounts `InstallK3k` without an `@error` listener. `InstallK3k.vue:373` emits the error and nothing receives it. Only `CruK3KCluster/index.vue:860` listens.

Stubbed on the landing page:

| Stub | Result |
|---|---|
| processed `False`, message `error 404: Not Found` | 4 polls, 3.1 s, button text `Error`, no message anywhere on the page |
| index with only `1.3.2-rc1` in range | button text `Error`, no message |
| index `2.0.0`, `1.4.0` | button `Error` plus the warning banner (rendered inside `InstallK3k`, so it works) |

The gap existed before this PR for the old generic message. This PR adds five specific messages and none of them reach the landing page user. `virtual-clusters-landing.spec.ts` has no error-case test, which is why it is not caught.

Options:
- Render the error inside `InstallK3k.vue`, next to the `versionsTooHigh` banner at `:426-431`. One code path for both hosts; `handleInstallationError` in `CruK3KCluster` could then be removed. Preferred.
- Add `@error` plus a `Banner` to `pages/index.vue`.

### 2. "Not processed" window (11 polls) expired before Rancher processed a spec change — reproduced once

Setup equal to the e2e test `installs k3k when the k3k repo exists but has not downloaded`: repo created with `.../does-not-exist`, condition `False` at generation 1, then Install K3k clicked in the create form.

Observed, from the repo's `managedFields` and condition timestamps:

| Time (UTC) | Event |
|---|---|
| 17:34:09 | controller sets `False`, `observedGeneration` 1 |
| 17:34:16 | `importYaml` applies the correct URL, generation 2 |
| 17:34:16 – 17:34:28 | 11 polls, all `gen=2 observed=1`; banner `The suse-virtual-cluster-engine repository did not finish downloading.` |
| 17:34:35 | controller sets `True`, `observedGeneration` 2 (19 s after the spec change) |

A second click then installed `1.2.1` in 5.3 s, and the first error banner was cleared.

Two further samples, changing `spec.url` by `PUT` instead of `importYaml`, were processed in 3.2 s and 3.3 s. So: 1 slow sample of 3. The cause of the 19 s delay is not determined. Check that would settle it: Rancher pod logs for `Skipping handler for clusterrepo suse-virtual-cluster-engine` (`repo.go:448`, the resourceVersion guard in `shouldSkip`) in that window.

Consequences:
- The PR's own "areas to test" item 2 can fail on first click.
- The e2e test above can fail the same way. `REPO_DOWNLOAD_TIMEOUT` (60 s) on `cy.wait('@k3kInstall')` does not help, because the button stops at about 11 s.

Suggestion: raise `DOWNLOAD_MAX_RETRIES` for the unprocessed branch only (for example 30). The objection in the Copilot thread (a long spinner before a known error) applies to the processed-`False` branch. In the unprocessed branch the controller has not answered yet, so waiting longer is waiting for information.

### 3. Processed `False` with an unchanged spec is terminal; clicking again repeats the same error — traced, not reproduced

Chain, read from source:
- `importYaml` with a spec identical to the stored one does not change `metadata.generation` (Kubernetes behaviour, recalled; not observed in this session).
- `InstallK3k.vue:265` then sees `processed` true on the first poll, and `:273-277` fails after 3 more polls.
- The controller does not retry soon: 401/403/404 are never re-enqueued (`repo_oci.go:163-171`, `setCondition` has no `EnqueueAfter`); other non-429 registry errors wait `ociInterval`, 24 h by default (`repo_oci.go:210-211`).

So a host cluster whose k3k repo once failed with the correct URL (registry outage, proxy, expired pull secret) returns the same error after about 3 s on every click, until the 24 h refresh or a manual repo refresh. The old code had the same limit with a worse message.

Suggestion: on the first processed `False`, set `spec.forceUpdate` to the current time once. `shell/models/catalog.cattle.io.clusterrepo.js:67` does this for the Refresh action. It changes the spec, so `shouldSkip` (`repo.go:452-456`) resets retries and the controller downloads again; the existing `observedGeneration` check then waits for the real result. With that in place the 3 extra polls on `False` are not needed: a `False` that arrives after a forced refresh is the answer.

The same mechanism would also refresh a stale `True` index. Currently a repo downloaded up to 24 h earlier is used as it is.

On the open Copilot thread (`InstallK3k.vue:276`): the default 429 policy is `MinWait` 1 s, `MaxWait` 5 s, `MaxRetry` 5 (`repo_oci.go:37-41`), and the condition message already contains `Will retry after Ns`, which the banner shows (verified with a stubbed 429 message). Not waiting for the whole backoff is reasonable. The comment at `InstallK3k.vue:25` ("auto-retried by the backend after 1s") describes only the first 429 retry.

### 4. Fresh install is followed by the "newer version" banner — reproduced, pre-existing logic

The real index today:

| Index key | Versions |
|---|---|
| `suse-virtual-cluster-engine` | 1.2.1 |
| `appco-suse-virtual-cluster-engine` | 1.2.0, 1.1.2, 1.1.1, 1.1.0, 1.0.3, 1.0.2, 1.0.1, 1.0.0 |

Extension `1.3.0-rc1` gives `K3K_MAX_VERSION` `1.3.x`; the button installed `1.2.1`. The create form then shows `k3k.hostCluster.k3kVersionMismatch`: "There is a newer version of the K3K controller compatible with this Rancher installation ... upgrade". No such version exists. `verifyK3kVersionMatches` (`k3kInstalled.js:119`) requires equal major.minor, while this PR defines "at or below" as supported.

Not introduced here, but this PR makes it the designed result whenever k3k has not yet released the matching minor. Options: show the banner only when the repo index holds a version above the installed one and within `K3K_MAX_VERSION`; or reword it for the "extension is ahead of k3k" case. Suitable for a follow-up issue.

### 5. Prerelease policy during an RC cycle — question

`semver.maxSatisfying(..., '<=1.3.x')` resolves to `<1.4.0-0` without `includePrerelease`. Results from the semver run:

| Index versions | Picked | Reason if null |
|---|---|---|
| 1.4.0, 1.3.2-rc1, 1.3.1, 1.3.0 | 1.3.1 | |
| 1.4.0, 1.2.5, 1.2.0, 1.0.2 | 1.2.5 | |
| 1.4.0-rc1, 1.3.0-rc1 | null | onlyPrereleaseK3kVersions |
| 1.4.0-rc1 | null | tooHigh |
| 2.0.0, 1.4.0 | null | tooHigh |
| latest | null | noValidK3kVersions |
| latest, 1.4.0 | null | tooHigh |
| v1.3.1, 1.3.0 | v1.3.1 | |

An RC build of the extension (the current `1.3.0-rc1`) with an index of `1.3.0-rc1` plus `1.2.x` installs `1.2.x` without any notice. `onlyPrereleaseK3kVersions` is reached only when no stable version at or below the maximum exists. If QA is expected to install a k3k RC through the button during the RC cycle, this needs `includePrerelease` when the extension version is itself a prerelease. If not, no change.

### 6. `noK3kCharts` is not reachable through the real controller — minor

Observed: a repo with no charts gets condition `False`, message `there are no helm charts in the repository specified` (`repo_oci.go:213-215`), so the flow ends in `repoDownloadFailed` before the index is read. The stubbed empty index does produce the message. Keeping the key as a defensive case is acceptable.

### 7. Code details

- `InstallK3k.vue:251-252`: the comment states 11 tries in total. With the separate `failedTries` counter the upper bound is 10 unprocessed retries plus 4 processed-`False` polls.
- `InstallK3k.vue:291`: `k3kRepo.links?.index` can be `undefined`; the request then fails with an unrelated message. A guard with a specific error is cheap.
- `InstallK3k.vue:288-289` and `k3k-chart.js:1`: extra blank lines (lint passes).
- `k3k-chart.js:40` and `k3kInstalled.js:112` both compute `semver.coerce(pkgjson.version)`. One exported constant would keep the two version rules on the same input.
- `k3k-chart.js:5`: the comment says the file exists to avoid `@shell` imports. It now also imports `semver` and `package.json`; both resolve in cypress, so the comment remains accurate but incomplete.

### 8. Tests

- No error-case test on the landing page (see finding 1).
- `installK3kAndCheck` in `generic.spec.ts` computes the expected chart with `k3kChartToInstall` through `k3kChartFromIndex`, the same function the button uses. The three real-registry tests therefore verify the request path, not the selection. The stubbed tests assert literal versions, so selection is covered there.
- `virtual-clusters-landing.spec.ts:51` asserts the text `Installing virtual clusters within virutal clusters in not currently supported`. This fixes the two typos of `en-us.yaml:370` into the test. Correct the string, or assert on `k3k-landing-notice` only.
- `virtual-clusters-landing.spec.ts:83`: raw `find('[data-testid="install-k3k-button"]')` in the spec; `landingPage.installK3kButton()` exists.
- `cypress/e2e/utils/k3k-install.ts` and `cypress/support/commands/k3k.ts` duplicate `APP_TYPE`, `REPO_TYPE`, `NAMESPACE_DELETE_RETRIES`, `DEPLOYED_RETRIES`, `IndexChart`, and the index lookup (`k3kChartFromIndex` and `k3kChart`).
- `virtual-clusters-landing.po.ts:8`: "extenion's".
- Idempotency, read from the specs: each stubbed test installs its own intercepts; the real-registry tests call `removeK3k` in `beforeEach`; `hostClusterId` is set in `before` and survives a retry. No dependency between test blocks was found.
- `pkg/` has no unit tests at all, so `k3k-chart.js` has none. The three exported functions are pure and are the cheapest part of this PR to cover if unit tests are introduced.

## Verified working

- Landing page, real registry, no repo: `importYaml`, 4 repo polls, index read, `POST ?action=install` with `chartName: suse-virtual-cluster-engine`, `releaseName: suse-virtual-cluster-engine`, `version: 1.2.1`; "K3K installed" after 8.4 s; app reached `deployed`.
- Create form, stubbed: too-high banner renders under the button; `Error installing K3K: ...` banners carry no `Error: ` prefix; a second click replaces the earlier error instead of adding to it; a 500 from the install action shows its message.
- `versionsTooHigh` is reset in the host setter (`InstallK3k.vue:149`), which resolves the first Copilot thread. Read from the code; not exercised in the browser, because the user has one eligible host cluster.
- No `TODO nb` in the diff.

## Environment notes

- Host cluster state after testing: no app in `k3k-system`, no `suse-virtual-cluster-engine` ClusterRepo, no `k3k-system` namespace. This equals the state found at the start. Removal used the same three `DELETE` calls as `uninstallK3k` in `cypress/e2e/utils/rancher-api.ts`.
- Screenshots: `~/github/dashboard/.playwright-mcp/pr255-landing-too-high.png`, `pr255-landing-download-failed.png`, `pr255-form-too-high.png`, `pr255-form-download-failed.png`, `pr255-form-k3k-121-installed.png`. In `pr255-form-too-high.png` the blue banner at the top comes from the stub (k3k was really installed while the count was stubbed to zero); ignore it there.
- Sandbox rejections: `gh` (read of `~/.config/gh/config.yml` denied) — PR data came from `git fetch upstream pull/255/head` and the unauthenticated GitHub API; `curl` to `localhost:8005` (connection refused from the sandbox) — the browser was used instead. No command needed manual approval.
