# Case 0 – Preconditions (+ X1: CI on GitHub Actions)

## Summary

Set up the test project so the homework suite can run: Node 18 or newer declared, `@playwright/test`
pinned to exactly 1.39.0 (package.json **and** lockfile), an `npm test` runner script that runs the
whole suite, and a GitHub Actions workflow that runs that script on every pull request to `main` and
every push to `main` on a clean runner.

Because X1 can only be proven by a CI run that really executes tests, Case 0 also contributes the
suite's single smoke test: it opens a real page in the project's browser and asserts visible content
on it. The project browser is **Firefox** — the only browser build shipped with Playwright 1.39.0
that launches both on the local machine and on the pinned CI image.

Setup facts (Node floor, Playwright pin, `npm test` script, workflow) are verified by the pipeline's
gate and by the CI run itself. No Playwright test parses `package.json`, the lockfile or workflow YAML.

## Steps: original → refined

| ID | Original | Refined (observable) | Verified by |
|---|---|---|---|
| 0.1 | Nodejs: 18 or newer | package.json states the Node floor as "18 or newer" (satisfied by 18.x and every later major), and the suite demonstrably runs on that floor: a CI run executes the full suite on Node 18 and on a newer major. | Gate reads package.json; CI run of X1 |
| 0.2 | Playwright: 1.39.0 | The project depends on Playwright Test at exactly 1.39.0, not a range: package.json names the single version, and the committed lockfile resolves it to 1.39.0, so a clean install reproduces it. | Gate: exact-pin check in package.json + lockfile |
| 0.3 | Create test runner script in package.json | package.json defines a runner script invoked as `npm test` that runs the whole suite (every spec, no case/browser/tag filter), so a later case's spec needs no change to the script. | Gate: `npm test` script exists and runs the suite |
| X1 | The tests run in CI on GitHub Actions: every pull request to `main` and every push to `main` runs the full suite on a clean runner, using the test runner script from 0.3. | A workflow triggers on pull requests targeting `main` and pushes to `main`; each run starts from a clean runner, installs dependencies from the committed lockfile plus the browser build of the pinned Playwright version, and runs the full suite through `npm test`, failing the run on any test failure. The runner image is one for which Playwright 1.39.0 publishes browser builds and dependency lists. | `actionlint` in the gate; decisively the CI run itself |

## Acceptance criteria

| ID | Step | Criterion | Source |
|---|---|---|---|
| AC-0.1a | 0.1 | package.json declares a Node version requirement of 18 or newer. | original |
| AC-0.1b | 0.1 | The full suite runs in CI on Node 18 (the lowest version the step allows) and on a newer supported major, and passes on both. | original |
| AC-0.2a | 0.2 | package.json requires Playwright Test at exactly 1.39.0, expressed as that single version rather than a range. | original |
| AC-0.2b | 0.2 | The committed lockfile resolves Playwright Test to 1.39.0, so a clean install yields that exact version. | original |
| AC-0.3 | 0.3 | package.json defines a test runner script that `npm test` invokes, and running it executes the entire suite rather than a selected subset. | original |
| AC-X1a | X1 | A workflow is configured to run on pull requests targeting `main` and on pushes to `main`, and in both cases it runs the full suite through the 0.3 runner script. | original |
| AC-X1b | X1 | The workflow prepares everything it needs on a clean runner (dependencies from the lockfile, browser build of the pinned version) and a real run completes with the suite passing; a failing test fails the run. | original |
| AC-X1c | X1 | The suite contains at least one test that launches the project's browser, opens a real web page and asserts visible content on it. **Added** because X1 is only provable by a CI run that actually executes tests: Case 0 merges before any other case, so without such a test the suite would be empty and a green run would prove nothing about the browser install. | added |

## Observations (facts, 2026-11-26)

- `npm view @playwright/test@1.39.0 version engines` → version `1.39.0`, `engines.node ">=16"`. The
  Node 18 floor comes from step 0.1, not from Playwright.
- `npm view @playwright/test versions` lists 1.39.0 as published next to current releases up to
  1.65.1 (plus 1.66.0 alphas dated today): pinning 1.39.0 deliberately installs a ~3-year-old release.
- `browsers.json` at tag `v1.39.0`: chromium **119.0.6045.9** (rev 1084), firefox **118.0.1**
  (rev 1425), webkit **17.4** (rev 1921) are the install-by-default builds.
- Measured by the pipeline on this machine (macOS 26, arm64) with 1.39.0: Chromium (build 1084)
  crashes at launch with `SEGV_ACCERR`, headless and headed; Firefox 118.0.1 and WebKit 17.4 work.
- Playwright v1.39.0 `nativeDeps.ts` defines dependency lists only for `ubuntu18.04`, `ubuntu20.04`,
  `ubuntu22.04`, `debian11`, `debian12` and their arm64 variants — nothing newer than Ubuntu 22.04.
- `actions/runner-images` README today: `ubuntu-latest` now resolves to **Ubuntu 26.04**; the explicit
  `ubuntu-24.04` and `ubuntu-22.04` labels are still offered.
- The Firefox 118.0.1 Linux build for 22.04 is still downloadable: HEAD on revision 1425's
  `firefox-ubuntu-22.04.zip` returns 307 → `playwright.download.prss.microsoft.com`, then HTTP 200,
  `content-length: 84692530` (last modified 2025-11-25).
- `nodejs.org/dist/index.json`: Node 18's final release **18.20.8** is still published, so a CI matrix
  entry for 18 can still be provisioned.
- nodejs Release `schedule.json`: v18 ended 2025-04-30, v20 ended 2026-04-30, v22 ends 2027-04-30,
  v24 ends 2028-04-30. Both 18 and 20 are past end-of-life today; the requirement still names 18 as
  the floor.
- `https://www.saucedemo.com/` → HTTP 200, `<title>Swag Labs</title>`, visible text "Swag Labs": a
  stable page on a host the homework already uses (Cases 1 and 2).
- The repository holds no package.json, lockfile, Playwright config, tests directory or workflow yet;
  everything in this case is created from scratch.

## Decisions (ambiguities resolved)

| Question | Decision | Risk |
|---|---|---|
| Which browser, given that the 1.39.0 Chromium build cannot launch locally and the local gate must pass before merge? | One browser project: **Firefox** 118.0.1, identical locally and in CI. Chromium is excluded because it crashes at launch locally, so no Chromium test could pass the gate; WebKit works but adds nothing here, and a single browser keeps local and CI results identical. All later cases target Firefox. | low |
| Which GitHub runner image, since `ubuntu-latest` is Ubuntu 26.04 today? | Pin `ubuntu-22.04`: the newest image for which Playwright 1.39.0 ships both a browser build and a dependency list. On 24.04/26.04 the browser-dependency install has no entry for the distribution. | medium |
| "Nodejs: 18 or newer" — which versions to declare and exercise, with 18 and 20 both past EOL? | Declare the floor as 18 or newer and keep CI exercising 18 (still installable as 18.20.8) plus a newer major. The step's strength is a lower bound, so proving the suite runs on the lowest allowed version is the honest check; EOL status is not a reason to raise the floor the homework names. | low |
| What is a "test runner script" (0.3), and how does it relate to X1's "full suite"? | A single `npm test` script running the whole suite with no case/browser/tag filter, invoked verbatim by the CI job. X1's "full suite" and 0.3's script are then the same thing by construction, and later cases are picked up without touching either. | low |
| Does "Playwright: 1.39.0" mean at least, or exactly, 1.39.0? | **Exactly** 1.39.0, pinned without a range and resolved to 1.39.0 in the lockfile. The step names one version; a range would silently install a different one on a clean runner. | low |
| Case 0 has no behaviour of its own, yet X1 requires a CI run of the suite. What does it execute? | Exactly one smoke test: open the Swag Labs login page (saucedemo.com, the host Cases 1 and 2 use) in Firefox and assert the visible "Swag Labs" branding. One real page load in the real browser is the smallest proof that the install works, on a host the homework already names. | low |
| Should a Playwright test assert the Node version, the Playwright pin or the workflow contents? | No. Those are verified by the gate (pin check, `npm test` check, `tsc`, `actionlint`) and by the CI run; a test parsing package.json or YAML would re-implement a linter and prove nothing about the running environment. | low |

## Test data

| Item | Value |
|---|---|
| Node requirement | 18 or newer (floor from 0.1) |
| CI Node versions | 18 and 20 |
| Playwright version | 1.39.0 (exact pin, package.json + lockfile) |
| Test runner invocation | `npm test` (whole suite) |
| Browser project | `firefox` (Firefox 118.0.1, bundled with 1.39.0) |
| CI runner image | `ubuntu-22.04` |
| Smoke page | `https://www.saucedemo.com/` (Swag Labs login page, same host as Cases 1–2) |
| Smoke expected visible text | `Swag Labs` |

## Requirement deviations

_None._ Every step is fulfillable as written: Playwright 1.39.0 and its Firefox build are still
obtainable, Node 18.20.8 is still provisionable, and the CI triggers X1 asks for are standard
GitHub Actions behaviour.
