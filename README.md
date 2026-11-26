# Genesys homework: Playwright + TypeScript

Automated tests for the Genesys TypeScript homework (`requirements/homework.md`), written by a local multi-agent pipeline. The pipeline is the main deliverable; the tests are its output.

## How this was built

The tests were written by a local multi-agent pipeline, not by hand, and reviewed by a human before submission. The full design and every lesson from 16+ runs are in [`PLAN.md`](PLAN.md); the pipeline code is in [`pipeline/`](pipeline/).

- **Per case:** an **Analyst** (Claude Opus, with a browser) explores the live site and turns the original requirement into a spec, including documented deviations where a step can't be fulfilled as written. A **Coder** (Claude Sonnet) implements it. A deterministic **gate** runs `tsc`, the tests 3× (flaky = failed), the full suite, and checks (exact Playwright pin, no hard-coded hosts, spec ↔ README deviations). A **Reviewer** (Codex, a different model) and the Coder loop until it ships. A fresh **Acceptance** check compares the code with the *original* text, not the spec.
- **The orchestrator is plain TypeScript, not an agent:** everything that decides pass/fail is deterministic.
- **What the human did:** decided the open questions (Playwright 1.39.0 kept; built-in `request` client for Case 5), added the CI-LIMIT-4 runtime skip after the first CI run, and reviewed the result.
- **Biggest lesson:** the first versions produced tests about 3× larger than needed (every requirement re-asserted, `test.step` everywhere, hosts hard-coded). Proportionality rules plus deterministic checks (rather than more prompting) brought the final code to the size of a hand-written solution.

## How to run

Requires Node 18 or newer.

```bash
npm ci
npx playwright install firefox
npm test
```

All browser tests run on Firefox (one Playwright project per site, each with its own `baseURL`; Case 5 uses an `api` project): Playwright 1.39.0's Chromium build crashes at launch on Apple Silicon macOS, so Firefox (118.0.1, the build bundled with 1.39.0) is the browser that works identically on the local dev machine and on CI's `ubuntu-22.04` runner.

CI (`.github/workflows/playwright.yml`) runs the same `npm test` script on every pull request to `main`, every push to `main`, on a nightly schedule, and on manual dispatch, against Node 18 (the minimum the homework names) on `ubuntu-22.04`.

Note: `test/resources/credential.json` lives in `test/` because step 1.2 names that folder; the specs are in Playwright's usual `tests/`.

## Cases

| Case | Title | Test file |
|---|---|---|
| 0 | Preconditions + X1 (CI on GitHub Actions) | `tests/case-0-*.spec.ts` (smoke test) |
| 1 | Automate Purchase Process | `tests/case-1-*.spec.ts` |
| 2 | Verify error messages for mandatory fields | `tests/case-2-*.spec.ts` |
| 3 | Rich Text Editor | `tests/case-3-*.spec.ts` |
| 4 | iFrame and tab handling | `tests/case-4-*.spec.ts` |
| 5 | REST API testing | `tests/case-5-*.spec.ts` |

## Requirement deviations

Steps that cannot be fulfilled as written on the live site, how they were amended, and why. Written by the Analyst, validated by the Acceptance check.

### Case 0 (preconditions + X1 CI)
_None._

### Case 1
_None._

### Case 2

**D-2.6: Footer copyright year is the current year, not 2023**
- **Original:** Validate the footer message contains 2023 and Terms of Service
- **Amended:** Validate the footer message contains the copyright year of the current calendar year, derived at run time, and Terms of Service.
- **Why the original can't be fulfilled:** On 2026-11-26 the footer message reads `© 2026 Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy`. The year is computed, not content: the site's only script bundle renders the line as `["© ", new Date().getFullYear(), " Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy"]`, and the literal `2023` occurs zero times in that bundle. The footer showed 2023 only during the calendar year 2023 and can never show it again.
- **Why this amendment:** Only the year part of the step changes, and it changes to a value derived at run time rather than to today's hard-coded 2026, which would rot exactly as 2023 did. The "Terms of Service" half of the check stays exactly as written, and the check keeps its original strength: the footer must still carry the copyright year, taken from the same source the site uses.
- **Evidence:** [`docs/evidence/case-2/footer-year.md`](docs/evidence/case-2/footer-year.md)

### Case 3
_None._

### Case 4

**D-4.3: The new tab's title no longer contains "FREE Real Time Project"**
- **Original:** Verify new page is loaded in new tab with title: Selenium Live Project: FREE Real Time Project for Practice
- **Amended:** Verify new page is loaded in new tab with title: Selenium Live Project for Practice
- **Why the original can't be fulfilled:** The image in the iframe links to `www.guru99.com/live-selenium-project.html`, and on 2026-11-26 that page's title — in the browser and in the HTML served by curl — is `Selenium Live Project for Practice`. The string `FREE Real Time Project` occurs nowhere in the page, so the title the step names cannot be observed any more; the site renamed the page since the homework was written.
- **Why this amendment:** Only the expected literal changes, to the title the same page carries today; the step keeps its subject (a new tab opened by the click of 4.2) and its strength (an exact title comparison). A runtime-derived expectation is not an option here: deriving the title from the page under test would make the assertion tautological.
- **Evidence:** [`docs/evidence/case-4/new-tab-title.md`](docs/evidence/case-4/new-tab-title.md)

**D-4.6: The Selenium page has no "Join Now" button any more**
- **Original:** Verify the wide red Join Now button is displayed near bottom of the page
- **Amended:** Verify the sign-up call-to-action button near the bottom of the page — the button labelled `Subscribe for Free` in the newsletter block — is displayed
- **Why the original can't be fulfilled:** The page reached in 4.5 is `www.guru99.com/selenium-tutorial.html`, and on 2026-11-26 the string `Join Now` occurs zero times there, both in the served HTML and in the rendered text after the whole document is scrolled. Nothing near the bottom is a wide red button: the last call to action before the footer is the 270×52 px amber `Subscribe for Free` button, and the only red control in that region is an 85 px `Next →` link. The page was redesigned since the homework was written.
- **Why this amendment:** The check keeps everything the step still allows — the same page, the same position (the last call to action before the footer), the same role (a free sign-up button) and the same strength (one is-displayed assertion on one named element). Only the element's identity moves to the button that occupies that place today, chosen because it is part of the page's own served HTML, while the one remaining wide red "join" button is injected by a third-party script and sits mid-page.
- **Evidence:** [`docs/evidence/case-4/selenium-page-bottom-no-join-now.md`](docs/evidence/case-4/selenium-page-bottom-no-join-now.md)

### Case 5
_None._

## CI limitations

Tests that pass locally but are blocked on GitHub's runners by the site's bot protection. They skip at runtime only when the block page is detected.

### Case 0 (preconditions + X1 CI)
_None._

### Case 1
_None._

### Case 2
_None._

### Case 3
_None._

### Case 4
**CI-LIMIT-4: www.guru99.com blocks GitHub Actions runners**
- **Symptom:** the new tab opened in step 4.2 shows Cloudflare's challenge page ("Attention Required! | Cloudflare") instead of the article, so step 4.3 fails in CI only. demo.guru99.com itself is reachable.
- **Handling:** `utils/botProtection.ts` checks the new tab for the exact challenge-page titles; only then does the test skip with the reason `CI-LIMIT-4`. On days the runner gets through, the test runs in full. No attempt is made to get around the protection.
- **Evidence:** CI run [45826034004](https://github.com/atoth3/Gsys_hw_TA_agentic/actions/runs/45826034004); log excerpt in [`docs/evidence/case-4/ci-block.md`](docs/evidence/case-4/ci-block.md).
- **Still verified:** the test passes in full locally.

### Case 5
_None._
