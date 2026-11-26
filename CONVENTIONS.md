# Coding conventions

Binding for the Coder, checked by the Reviewer. "Must" rules are high-severity when broken.

## Project layout

- Must: Playwright Test (`@playwright/test`) pinned to exactly `1.39.0` (no `^` or `~`), in `package.json` and the lockfile.
- Must: an `npm test` script runs the whole suite (`playwright test`).
- Must: one spec file per case: `tests/case-<N>-<slug>.spec.ts`. Case 0 has a single smoke test, so CI always has something to run: it opens a real page in the project's browser and asserts something visible on it, so a CI run proves the browser install works.
- Setup and CI requirements (Node version, Playwright pin, the `npm test` script, the workflow) are verified by the pipeline's gate (pin check, `npm test` script check, `actionlint`) and by the CI run itself, **not** by Playwright tests. Don't write tests that parse `package.json`, the lockfile or workflow YAML: such a test re-implements a linter, and it can never catch every bad edit.
- Page objects in `pages/` (one class per page or component), shared helpers in `utils/`, test data in `test/resources/`.
- `tsconfig.json` must `include` only the test project (`tests/`, `pages/`, `utils/`, `playwright.config.ts`, …). It must not include `pipeline/`, which is a separate package with its own dependencies.
- `playwright.config.ts`: `testDir: 'tests'`; reporter settings per the CI checklist below.

## Proportionality (read this first)

This is a homework solution a reviewer reads in a few minutes. Small, idiomatic and obviously correct beats exhaustive.
- Must: assert what the requirement asks, once, at the strength it asks. No extra assertions for things the requirement doesn't mention (intermediate pages, negative checks like "nothing else is bold", element types, response headers, counts nobody asked for). A requirement step is usually covered by one or two `expect`s.
- Must: no speculative robustness: no defensive helpers, retries, custom error types or validation layers the requirement doesn't need. Playwright's web-first assertions and auto-waiting already handle timing.
- Must: configuration belongs in `playwright.config.ts`: `baseURL` (or per-project `baseURL` when cases use different hosts), timeouts, browsers. No hosts or URLs hard-coded in tests when a config value fits.
- Page objects stay thin: locators plus the few actions the test uses. No page object for a page the test only passes through.
- Over-engineering is a defect, like a missing check: the Reviewer reports both.

## Tests

- Must: test titles start with the case ID, e.g. `test('Case 5: GET /users logs names and emails', …)`.
- `test.step` is optional. Use it only where it makes a long flow easier to read, not for every step.
- Must: Page Object Model for UI cases. Tests talk to page objects, not to raw selectors.
- Locators: role-, label- or text-based first (`getByRole`, `getByLabel`, `getByText`), then `data-test` attributes. No XPath, no long CSS chains.
- Must: no `page.waitForTimeout()` or other hard sleeps. Wait for conditions with web-first assertions (`await expect(locator).toHaveText(…)`).
- Must: no `test.only`; no blanket `test.skip`.
- Tests are independent: no shared state between tests, any order works.
- Assert the documented requirement (oracle rule). Values that change over time (for example the current year) are computed at runtime, never hard-coded from what the site showed today.
- Required log output (for example "Name | email" lines) goes to `console.log` in exactly the required format.

## CI limitations (sites that block CI runners)

Some sites block data-centre IPs (GitHub Actions runners) with bot protection. When a test passes locally but fails only in CI:
- Never get around the protection: no stealth plugins, faked fingerprints, or challenge solving.
- Never skip blanket-style (`test.skip(!!process.env.CI)`).
- Allowed: right after the navigation that can be blocked, detect the challenge page with an exact signature from a shared helper `utils/botProtection.ts`, and only then `test.skip(true, 'CI-LIMIT-<N>: blocked by bot protection, see README')`. "The page looks different" is never a reason to skip.
- Document it in README "CI limitations", your case's subsection: ID, site, symptom, handling, evidence (committed under `docs/evidence/case-<N>/`), and that it still runs locally.

## CI workflow checklist (`.github/workflows/playwright.yml`, Case 0)

- Triggers: `pull_request` to `main`, `push` to `main`, `workflow_dispatch`, and a nightly `schedule`.
- `permissions: contents: read`; no secrets.
- `concurrency`: pull requests share one group per PR and cancel their in-progress runs; push, nightly and manual runs must never cancel or replace each other (a concurrency group keeps only ONE pending run, so a shared group for pushes to `main` would silently drop a queued push run). For example `group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
- Node `18` (the minimum "18 or newer" names) via `actions/setup-node` with npm cache. One version is enough: the tests barely depend on Node.
- `npm ci`, then `npx playwright install --with-deps` (the version from the lockfile, never `@latest`), then `npm test`.
- `playwright.config.ts` with `process.env.CI`: `forbidOnly: true`, `retries: 1`, `trace: 'on-first-retry'`, reporters `github` + `html` + `json` (to `test-results/results.json`).
- Upload `playwright-report/` and `test-results/` with `if: ${{ !cancelled() }}`.
- Job summary (`$GITHUB_STEP_SUMMARY`) lists flaky tests (passed on retry) and a "Skipped in CI" table (test, CI-LIMIT ID, reason). Keep it short: a few lines of `jq` or `node -e` over `test-results/results.json`, not a separate script.
- `timeout-minutes` on the job; actions pinned to a major tag (`@v4`), never `@main`.

## README ownership

`README.md` is shared. Each role edits only its own part:
- Case 0 Coder: "How to run".
- Analyst of case N: "Requirement deviations › Case N".
- Coder of case N: "CI limitations › Case N".
The pipeline rejects changes to any other part.
