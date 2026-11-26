# Case 1 – Automate Purchase Process

## Summary

Automate the Swag Labs purchase process end to end as `performance_glitch_user`: open the inventory
URL (which bounces an anonymous visitor to the login page), log in with credentials read at run time
from a committed `credential.json`, add **Sauce Labs Backpack** and **Sauce Labs Fleece Jacket**,
validate that the cart badge shows **2**, walk the whole checkout (cart → customer information →
overview → finish) and validate that the order-confirmation message **"Thank you for your order!"**
is shown.

One trait of the case dominates its implementation: `performance_glitch_user` is deliberately slow.
The login submit takes about **ten seconds** before the inventory listing appears; everything after
it is fast. Waits have to absorb that — no check may be shortened or dropped because of it.

## Steps: original → refined

| ID | Original | Refined (observable) |
|---|---|---|
| 1.1 | Open the url: https://www.saucedemo.com/inventory.html | The test's entry point is the inventory page address named in the step. Opened by an anonymous visitor, the site answers it by sending the browser to the login page and showing the alert `Epic sadface: You can only access '/inventory.html' when you are logged in.`; the test therefore opens that address first and continues with the login that 1.3–1.4 require, ending up on the inventory page itself. |
| 1.2 | Create a credential.json file in test/resources folder and store: `{ username: performance_glitch_user, password: secret_sauce }` | A file named `credential.json` exists in the repository under the `test/resources` folder named by the step, holding exactly the two fields the step lists — username `performance_glitch_user`, password `secret_sauce` — written as valid JSON so 1.3 can parse it. It is committed with the project (it holds only the demo credentials the site publishes on its own login page). |
| 1.3 | Parse the credentials from credential.json and use it for the following test | The username and password the test logs in with are obtained by reading and parsing that credential file at run time; neither value appears as a literal in the test. Changing a value in the file changes what the test types. |
| 1.4 | On the website type username and password and click on login button | On the login page the test types the parsed username into the Username field and the parsed password into the Password field, then clicks the Login button, and waits for the resulting product listing to appear (the submit takes ~10 s for this account). |
| 1.5 | Add the following items to the cart: Sauce Labs Backpack, Sauce Labs Fleece Jacket | From the product listing the test adds the two named products to the cart using each product's own add-to-cart control, and adds no other product, so the cart holds exactly those two items. |
| 1.6 | Validate the number on the cart symbol | The test asserts that the number shown on the cart symbol in the page header **equals the number of items added in 1.5, i.e. 2**. |
| 1.7 | Go through the checkout process | The test completes the site's whole checkout sequence without shortcuts: it opens the cart from the cart symbol, starts the checkout, fills the three mandatory customer-information fields (first name, last name, postal code), continues to the order overview and finishes the order, arriving at the order-completion page. |
| 1.8 | Validate that Thank you for your order message is appearing | On the order-completion page the test asserts that the order-confirmation message is visible and that its text is the step's message as the site writes it: `Thank you for your order!`. |

## Acceptance criteria

| ID | Step | Criterion | Source |
|---|---|---|---|
| AC-1.1 | 1.1 | The first page the test opens is the inventory page address named in step 1.1, and the test proceeds from the login page the site shows an anonymous visitor there. | original |
| AC-1.2 | 1.2 | A committed file named `credential.json` lives in the `test/resources` folder and contains, as parsable JSON, the username `performance_glitch_user` and the password `secret_sauce`. | original |
| AC-1.3 | 1.3 | The credentials the test logs in with are read and parsed from that `credential.json` at run time, and neither the username nor the password is written as a literal anywhere in the test. | original |
| AC-1.4 | 1.4 | The test types the parsed username and password into the login form's username and password fields and clicks the login button, after which the product listing is shown. | original |
| AC-1.5 | 1.5 | The test adds exactly the products `Sauce Labs Backpack` and `Sauce Labs Fleece Jacket` to the cart, each through its own add-to-cart control, and adds no further product. | original |
| AC-1.6 | 1.6 | The test asserts that the number displayed on the cart symbol is `2`, the count of items added in 1.5. | original |
| AC-1.7 | 1.7 | The test goes through every stage of the checkout the site requires — cart, customer information with all three mandatory fields filled, order overview, finish — and reaches the order-completion page. | original |
| AC-1.8 | 1.8 | The test asserts that the order-confirmation message `Thank you for your order!` is visible on the completion page. | original |

No `added` criteria: every check in this case is demanded by the original wording.

## Observations (facts, 2026-11-26)

- Opening the inventory page address as an anonymous visitor does **not** render the inventory: the
  browser ends on the site root (the login page) and the form shows the alert
  `Epic sadface: You can only access '/inventory.html' when you are logged in.` with a
  "Dismiss error" button. No HTTP error, no interstitial.
- The login page publishes the data this case uses: `Accepted usernames are:` → `standard_user`,
  `locked_out_user`, `problem_user`, `performance_glitch_user`, `error_user`, `visual_user`, and
  `Password for all users:` → `secret_sauce`.
- Login form fields are accessibly named `Username` and `Password`; the submit control is a button
  named `Login`.
- Logging in as `performance_glitch_user` / `secret_sauce` succeeds and lands on the inventory page,
  which lists 6 products, each with its own "Add to cart" button; the header shows `Products`, a sort
  combobox and the cart symbol.
- Both products named in 1.5 are present with those exact titles: `Sauce Labs Backpack` ($29.99) and
  `Sauce Labs Fleece Jacket` ($49.99).
- The cart symbol carries **no** number while the cart is empty (accessible name `Cart, empty`).
  After adding the two products it reads `Cart, 2 items` and contains a badge element whose visible
  text is exactly `2`.
- The badge updates immediately on add-to-cart (within the same automation round trip, well under a
  second).
- Checkout observed in full: cart page (heading `Your Cart`, both items at quantity 1, buttons
  "Continue Shopping" / "Checkout") → `Checkout: Your Information` with three textboxes
  `First Name`, `Last Name`, `Zip/Postal Code` and buttons "Cancel" / "Continue" →
  `Checkout: Overview` (SauceCard #31337, Free Pony Express Delivery, Item total $79.98, Tax $6.40,
  Total $86.38) with "Cancel" / "Finish" → `Checkout: Complete!`. First Name `Test`, Last Name
  `User`, Zip `1234` were accepted.
- The completion page shows a level-2 heading whose exact text is `Thank you for your order!` (the
  step's wording plus an exclamation mark), then `Your order has been dispatched, and will arrive
  just as fast as the pony can get there!`, plus "Back Home" and "Generate PDF order" buttons. The
  cart badge is gone at that point.
- **Timing of the slow account**, measured in the page: a timestamp taken immediately before the
  login click, compared after the inventory listing had rendered, gave **~11.6 s** (including one
  automation round trip) — roughly ten seconds of deliberate delay in the login submit. Every later
  transition (add to cart, open cart, checkout steps) completed in well under a second, so the
  slowness is specific to the login submit, not to the session.
- No cookie/consent banner, no iframe and no third-party overlay appeared anywhere in the flow. The
  only console output is one harmless error per page load
  (`Permissions policy violation: unload is not allowed in this document`).

## Decisions (ambiguities resolved)

| Question | Decision | Risk |
|---|---|---|
| 1.1 says open the inventory page, but 1.3–1.4 require logging in — and an anonymous visitor is sent to the login page with an error. Where does the test start? | Exactly where 1.1 says: open the inventory address, let the site redirect to the login page, log in there, arrive on the inventory page. The step instructs to open that URL; it does not claim the inventory renders anonymously, and the redirect is the site's documented behaviour. No amendment needed. | low |
| The credential block in 1.2 is not valid JSON (unquoted keys/values), yet 1.3 says to parse it. | Store the same two fields and values as **valid JSON**. 1.3 explicitly requires parsing, and only valid JSON parses; names and values stay exactly as written. | low |
| The step names the folder `test/resources`, while the suite's specs live in a `tests` folder. | Use the requirement's literal path `test/resources/credential.json`: the case is graded against the original wording, and the file is data, not a spec the runner must discover. | low |
| Should `credential.json` be committed, given that it holds a username and password? | Commit it. 1.2 asks for the file to be part of the project, and the values are the demo credentials the site prints on its own login page. The ignore rules must not exclude it, or 1.3 would have nothing to parse on a clean CI checkout. | low |
| "Validate the number on the cart symbol" (1.6) — against what? | Against the number of items 1.5 adds: the badge must read **2**. Reading the site's current value as the expectation would make the check vacuous; the requirement's strength is an equality. | low |
| 1.7 gives no customer information, but the checkout form demands first name, last name and postal code. | Neutral placeholders (`Test` / `User` / `1234`), verified accepted today. The requirement constrains them in no way and the site validates only their presence. | low |
| 1.8 writes "Thank you for your order" while the page says "Thank you for your order!". | Assert the message as the site writes it, exclamation mark included — the step's wording is contained in it verbatim, which keeps the check exact instead of loosening it to a partial match. | low |
| Does the ten-second login delay of `performance_glitch_user` justify relaxing anything? | **No.** The account is named by the requirement, so its slowness is part of the case: the test waits for the inventory listing with a budget comfortably above the observed delay. No assertion is weakened, no step skipped. | medium |

## Test data

| Item | Value |
|---|---|
| Entry page | the inventory page address given in 1.1 (`https://www.saucedemo.com/inventory.html`) |
| Credential file | `test/resources/credential.json` (committed, valid JSON) |
| Username | `performance_glitch_user` |
| Password | `secret_sauce` |
| Products to add | `Sauce Labs Backpack`, `Sauce Labs Fleece Jacket` |
| Expected cart badge number | `2` |
| Checkout first name / last name / postal code | `Test` / `User` / `1234` |
| Expected confirmation message | `Thank you for your order!` |
| Browser project | `firefox` (the project browser chosen in Case 0) |
| Observed login delay | ~10 s between the login click and the rendered inventory listing |

## Requirement deviations

_None._ Every step is fulfillable as written: the inventory URL opens (redirecting an anonymous
visitor to the login page, which is where 1.4 happens anyway), both named products exist, the cart
symbol carries a number, the checkout runs to completion, and the completion page shows the
confirmation message the requirement names.
