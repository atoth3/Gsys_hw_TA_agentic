# Coding conventions

Binding for the Coder, checked by the Reviewer. "Must" rules are high-severity when broken.

## Project layout

- Must: Playwright Test (`@playwright/test`) pinned to exactly `1.39.0` (no `^` or `~`), in `package.json` and the lockfile.
- Must: an `npm test` script runs the whole suite (`playwright test`).
- Must: one spec file per case: `tests/case-<N>-<slug>.spec.ts`. Case 0 has a single smoke test, so CI always has something to run.
- Page objects in `pages/` (one class per page or component), shared helpers in `utils/`, test data in `test/resources/`.
- `tsconfig.json` must `include` only the test project (`tests/`, `pages/`, `utils/`, `playwright.config.ts`, …). It must not include `pipeline/`, which is a separate package with its own dependencies.
- `playwright.config.ts`: `testDir: 'tests'`; reporter settings per the CI checklist below.

## Tests

- Must: test titles start with the case ID, e.g. `test('Case 5: GET /users logs names and emails', …)`.
- Each original step is visible in the code: wrap it in `await test.step('5.2 Send GET /users', …)` using the step ID from `requirements/homework.md`. This is how the Acceptance check traces steps to code.
- Must: Page Object Model for UI cases. Tests talk to page objects, not to raw selectors.
- Locators: role-, label- or text-based first (`getByRole`, `getByLabel`, `getByText`), then `data-test` attributes. No XPath, no long CSS chains.
- Must: no `page.waitForTimeout()` or other hard sleeps. Wait for conditions with web-first assertions (`await expect(locator).toHaveText(…)`).
- Must: no `test.only`; no blanket `test.skip`.
- Tests are independent: no shared state between tests, any order works.
- Assert the documented requirement (oracle rule). Values that change over time (for example the current year) are computed at runtime, never hard-coded from what the site showed today.
- Required log output (for example "Name | email" lines) goes to `console.log` in exactly the required format, and the test also asserts that format.

## CI limitations (sites that block CI runners)

Some sites block data-centre IPs (GitHub Actions runners) with bot protection. When a test passes locally but fails only in CI:
- Never get around the protection: no stealth plugins, faked fingerprints, or challenge solving.
- Never skip blanket-style (`test.skip(!!process.env.CI)`).
- Allowed: right after the navigation that can be blocked, detect the challenge page with an exact signature from a shared helper `utils/botProtection.ts`, and only then `test.skip(true, 'CI-LIMIT-<N>: blocked by bot protection, see README')`. "The page looks different" is never a reason to skip.
- Document it in README "CI limitations", your case's subsection: ID, site, symptom, handling, evidence (committed under `docs/evidence/case-<N>/`), and that it still runs locally.

## CI workflow checklist (`.github/workflows/playwright.yml`, Case 0)

- Triggers: `pull_request` to `main`, `push` to `main`, `workflow_dispatch`, and a nightly `schedule`.
- `permissions: contents: read`; no secrets.
- `concurrency` per branch; cancel in-progress runs only for pull requests.
- Node matrix `18` and `20` via `actions/setup-node` with npm cache; `fail-fast: false`.
- `npm ci`, then `npx playwright install --with-deps` (the version from the lockfile, never `@latest`), then `npm test`.
- `playwright.config.ts` with `process.env.CI`: `forbidOnly: true`, `retries: 1`, `trace: 'on-first-retry'`, reporters `github` + `html` + `json` (to `test-results/results.json`).
- Upload `playwright-report/` and `test-results/` with `if: ${{ !cancelled() }}`.
- Job summary (`$GITHUB_STEP_SUMMARY`) lists flaky tests (passed on retry) and a "Skipped in CI" table (test, CI-LIMIT ID, reason).
- `timeout-minutes` on the job; actions pinned to a major tag (`@v4`), never `@main`.

## README ownership

`README.md` is shared. Each role edits only its own part:
- Case 0 Coder: "How to run".
- Analyst of case N: "Requirement deviations › Case N".
- Coder of case N: "CI limitations › Case N".
The pipeline rejects changes to any other part.
