# Genesys homework: Playwright + TypeScript

Automated tests for the Genesys TypeScript homework (`requirements/homework.md`), written by a local multi-agent pipeline (`pipeline/`, see `PLAN.md`).

## How to run

Requires Node 18 or newer.

```bash
npm ci
npx playwright install firefox
npm test
```

The suite runs on a single browser project, Firefox: Playwright 1.39.0's Chromium build crashes at launch on Apple Silicon macOS, so Firefox (118.0.1, the build bundled with 1.39.0) is the browser that works identically on the local dev machine and on CI's `ubuntu-22.04` runner.

CI (`.github/workflows/playwright.yml`) runs the same `npm test` script on every pull request to `main`, every push to `main`, on a nightly schedule, and on manual dispatch, against Node 18 and 20 on `ubuntu-22.04`.

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
_None._

### Case 3
_None._

### Case 4
_None._

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
_None._

### Case 5
_None._
