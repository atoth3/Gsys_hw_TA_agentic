# Case 2 – Verify error messages for mandatory fields

## Summary

Two checks on Swag Labs, in one sequence: open the inventory URL (which bounces an anonymous visitor
to the login page), submit the login form **with both fields empty** and validate the mandatory-field
error **"Epic sadface: Username is required"**; then log in as `standard_user` / `secret_sauce`,
scroll the inventory page to its bottom and validate that the footer message contains the copyright
year and **Terms of Service**.

One amendment is needed: the footer year is not content, the site renders
`new Date().getFullYear()`, so it reads **2026** today and can never read 2023 again. The expected
year is therefore derived at run time — see deviation **D-2.6**.

## Steps: original → refined

| ID | Original | Refined (observable) |
|---|---|---|
| 2.1 | Open the url: https://www.saucedemo.com/inventory.html | The test's entry point is the inventory page address named in the step. Opened by an anonymous visitor, the site sends the browser to the login page, which already shows the alert `Epic sadface: You can only access '/inventory.html' when you are logged in.`; the test continues from that login form. |
| 2.2 | Click on login button | Without typing anything, the test clicks the login form's Login button while both the username and the password field are still empty — that is what makes the site complain about the mandatory fields. |
| 2.3 | Validate the error message | The test asserts that the error message produced by the empty submit is visible and that its text is exactly what the site writes for the first missing mandatory field: `Epic sadface: Username is required` (replacing the access-denied alert the redirect of 2.1 had put there). |
| 2.4 | Login with the following credentials: standard_user / secret_sauce | On the same form the test types `standard_user` and `secret_sauce`, clicks Login, and ends up on the inventory page with its product listing shown. The leftover error from 2.2 does not have to be dismissed first. |
| 2.5 | Scroll down to the bottom of the page | On the page reached in 2.4 the test scrolls down to the very bottom, so that the footer at the end of the page is inside the viewport. |
| 2.6 | Validate the footer message contains 2023 and Terms of Service | The test asserts that the footer's copyright message contains the copyright year and the text `Terms of Service`. The year is derived at run time (the current calendar year) instead of the step's literal 2023, because the site computes it — see **D-2.6**. Observed today: `© 2026 Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy`. |

## Acceptance criteria

| ID | Step | Criterion | Source |
|---|---|---|---|
| AC-2.1 | 2.1 | The first page the test opens is the inventory page address named in step 2.1, and the test proceeds on the login form the site shows an anonymous visitor there. | original |
| AC-2.2 | 2.2 | The test clicks the login button with the username and password fields left empty, before entering any credentials. | original |
| AC-2.3 | 2.3 | The test asserts that the error message shown after that click is visible and that its text is `Epic sadface: Username is required`. | original |
| AC-2.4 | 2.4 | The test logs in through the same form with username `standard_user` and password `secret_sauce` and reaches the inventory page with its product listing. | original |
| AC-2.5 | 2.5 | The test scrolls the page reached after login down to its bottom, bringing the footer into the viewport, before checking the footer. | original |
| AC-2.6a | 2.6 | The test asserts that the footer message contains the copyright year, with the expected year derived at run time (the current calendar year) rather than hard-coded; see D-2.6. | original |
| AC-2.6b | 2.6 | The test asserts that the footer message contains the text `Terms of Service`. | original |

No `added` criteria: every check in this case is demanded by the original wording.

## Observations (facts, 2026-11-26)

- Opening the inventory page address as an anonymous visitor does **not** render the inventory: the
  browser ends on the site root (the login page) and the form shows the alert
  `Epic sadface: You can only access '/inventory.html' when you are logged in.` with a
  "Dismiss error" button. No HTTP error, no interstitial.
- Clicking Login with **both fields empty** replaces that alert with
  `Epic sadface: Username is required` (exact text, no trailing punctuation) and marks both inputs
  with an error style. The page does not navigate; the error element is the form's alert region
  (a heading with `role=alert` carrying a "Dismiss error" button).
- Filling only the username and clicking Login again yields `Epic sadface: Password is required`.
  That message needs a **second** submit, which this case's steps do not ask for.
- Form fields are accessibly named `Username` and `Password` (placeholders), the submit control is a
  button named `Login`. Neither input carries the HTML `required` attribute, so the message comes
  from the site's own validation, not from the browser.
- Logging in as `standard_user` / `secret_sauce` from that error state works **without** dismissing
  the error first and lands on the inventory page immediately (well under a second — unlike
  `performance_glitch_user` in Case 1).
- At the project browser's default window size (1280×720) the inventory document is 1110 px tall and
  the footer starts 970 px down: it is **below the fold** and not in view until the page is scrolled.
  Scrolling to the bottom (maximum offset 390 px) brings the footer fully into view.
- The footer's copyright message (one text line, `data-test="footer-copy"`) reads exactly
  `© 2026 Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy`. `Terms of Service` is
  plain text inside it, **not** a link; the footer's only links are X, Facebook and LinkedIn.
- The year is computed, not written: the site's single script bundle renders the line as
  `["© ", new Date().getFullYear(), " Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy"]`,
  and the literal `2023` occurs **zero** times in that bundle
  (evidence: [`docs/evidence/case-2/footer-year.md`](../../docs/evidence/case-2/footer-year.md),
  [`docs/evidence/case-2/footer-year.png`](../../docs/evidence/case-2/footer-year.png)).
- No cookie/consent banner, no iframe and no third-party overlay appeared anywhere in the flow. The
  only console output is one harmless error per page load
  (`Permissions policy violation: unload is not allowed in this document`).

## Decisions (ambiguities resolved)

| Question | Decision | Risk |
|---|---|---|
| 2.3 says "validate the error message", but two messages have occupied the alert by then: the access-denied one from the 2.1 redirect and the one the empty submit produces. Which? | The one 2.2 produces, `Epic sadface: Username is required`: the case is titled "error messages for mandatory fields" and 2.3 directly follows the empty-form click. Asserting that exact text also distinguishes it from the access-denied alert, so a test that never really submitted the empty form fails. | low |
| The title says "error messages" (plural) — validate the password error too? | No. The steps describe one click and one validation, and `Epic sadface: Password is required` only appears after a second submit with the username filled. Adding it would invent a step. | low |
| 2.4 says "Login with the following credentials" without naming fields or button. | Do what logging in means on this form: type `standard_user` and `secret_sauce`, click Login, wait for the inventory page. The leftover error banner needs no dismissing (verified today). | low |
| Case 1 reads credentials from `test/resources/credential.json` — should Case 2 too? | No. 2.4 names its credentials inline, the credential file is required only by Case 1 (steps 1.2–1.3) and holds `performance_glitch_user`. This case's credentials come from this spec's test data. | low |
| 2.5 says "the page" — which page, and does scrolling need its own assertion? | The page reached in 2.4 (steps are sequential), i.e. the inventory page. Scrolling is an action, not a validation: it is satisfied by actually scrolling to the bottom, which serves the footer check of 2.6. The footer really is below the fold, so the scroll is not decorative. | low |
| 2.6 says "the footer message" — whole footer or the copyright line? | The copyright message line: it is the footer's own message and contains both things the step names; the rest of the footer is just the three social links. | low |
| The footer cannot contain 2023 any more. Fail the test, or amend? | Amend to the current year, derived at run time (**D-2.6**). The requirement was written while the site showed 2023; its intent is that the footer carries the copyright year next to "Terms of Service". A 2026 copyright line in 2026 is correct behaviour, not a defect to report, and hard-coding today's 2026 would rot exactly as 2023 did. Only theoretical flake: a run crossing midnight on 31 December. | low |

## Test data

| Item | Value |
|---|---|
| Entry page | the inventory page address given in 2.1 (`https://www.saucedemo.com/inventory.html`) |
| Empty submit | login button clicked with both fields empty (no credentials typed) |
| Expected mandatory-field error | `Epic sadface: Username is required` |
| Username / password | `standard_user` / `secret_sauce` |
| Footer page | the inventory page reached after the login of 2.4 |
| Expected footer year | the current calendar year, derived at run time (observed `2026`; the step's literal 2023 is amended, see D-2.6) |
| Expected footer text | `Terms of Service` |
| Observed footer message | `© 2026 Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy` |
| Browser project | `firefox` (the project browser chosen in Case 0) |
| Observed viewport / scroll | 1280×720 window, document 1110 px tall, footer starts 970 px down, max scroll 390 px |

## Requirement deviations

**D-2.6: Footer copyright year is the current year, not 2023**

- **Original:** Validate the footer message contains 2023 and Terms of Service
- **Amended:** Validate the footer message contains the copyright year of the current calendar year,
  derived at run time, and Terms of Service.
- **Why the original can't be fulfilled:** On 2026-11-26 the footer message reads
  `© 2026 Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy`. The year is computed,
  not content: the site's only script bundle renders the line as
  `["© ", new Date().getFullYear(), " Sauce Labs. All Rights Reserved. Terms of Service | Privacy Policy"]`,
  and the literal `2023` occurs zero times in that bundle. The footer showed 2023 only during the
  calendar year 2023 and can never show it again.
- **Why this amendment:** Only the year part changes, and it changes to a value derived at run time
  rather than to today's hard-coded 2026, which would rot the same way. The "Terms of Service" half
  stays exactly as written, and the check keeps its original strength — the footer must still carry
  the copyright year, taken from the same source the site uses.
- **Evidence:** [`docs/evidence/case-2/footer-year.md`](../../docs/evidence/case-2/footer-year.md),
  [`docs/evidence/case-2/footer-year.png`](../../docs/evidence/case-2/footer-year.png)
