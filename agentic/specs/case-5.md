# Case 5 – REST API testing

## Summary

One REST API test against the public JSONPlaceholder service, **no browser involved**: send a single
`GET` to the `/users` endpoint of the host named in step 5.2 through the REST API request library that
already ships with the pinned `@playwright/test` 1.39.0 (no new dependency), parse the body as JSON,
log one line per user containing **only** that user's name and email in the example's `Name | email`
form and in response order, and validate that the **first** user's email address contains `@`.

The live API matches the requirement exactly today (the step's two example lines are literally the
first two records), so there is **no deviation** for this case.

## Steps: original → refined

| ID | Original | Refined (observable) |
|---|---|---|
| 5.1 | Add Rest Api library for the test project | The test project can issue HTTP requests from a test without driving a browser, and this case's request goes through that REST API request library. The framework pinned in Case 0 (`@playwright/test` 1.39.0) already contains such a library, so the capability comes from there: **no new third-party dependency**, no change to the exact version pin or the lockfile. |
| 5.2 | Create and send request: GET, host `https://jsonplaceholder.typicode.com`, endpoint `/users` | The test builds and sends exactly one request — method `GET`, to the `/users` endpoint of the host given in the step (not the browser base address the earlier cases use) — and receives a response. Observed today: HTTP 200, `application/json; charset=utf-8`, no redirect, ~40 ms. |
| 5.3 | Parse response to Json format | The test turns the response body into JSON data in memory (an array of user objects) and uses that parsed data as the source for 5.4 and 5.5, instead of working on the raw body text. |
| 5.4 | Log only the names and emails from the response data (example: `Leanne Graham \| Sincere@april.biz`, `Ervin Howell \| Shanna@melissa.tv`) | For every user in the parsed data, in response order, the test emits one log line containing **only** that user's name and email, joined as the example shows: name, space, vertical bar, space, email. No other response field (id, username, address, phone, website, company) appears in the output. Observed: 10 users → 10 lines, the first two exactly the example lines. |
| 5.5 | Verify the first email address contains @ | The test asserts that the email address of the **first** user in the parsed response data contains the character `@`. Observed today: the first user is `Leanne Graham`, email `Sincere@april.biz`. |

## Acceptance criteria

| ID | Step | Criterion | Source |
|---|---|---|---|
| AC-5.1 | 5.1 | This case's HTTP request is made through a REST API request library available to the test project, without adding a new third-party dependency and without changing the dependency versions pinned in Case 0. | original |
| AC-5.2 | 5.2 | The test sends exactly one request for its data: method `GET`, to the `/users` endpoint of the host named in step 5.2, and receives its response. | original |
| AC-5.2b | 5.2 | The test asserts that the response to that GET was successful (status 200). **Added:** the step only says "send", but this single status assertion is what makes the parse in 5.3 and the assertion in 5.5 meaningful — without it an outage or an error page surfaces as a confusing parse failure instead of a clear API failure. | added |
| AC-5.3 | 5.3 | The test parses the response body into JSON data, and that parsed data is what 5.4 and 5.5 read the names and emails from. | original |
| AC-5.4 | 5.4 | The test logs one line per user of the parsed response, in response order, each line containing only that user's name and email joined as in the step's example (`name \| email`), and no other response field. | original |
| AC-5.5 | 5.5 | The test asserts that the email address of the first user in the parsed response data contains `@`. | original |

One `added` criterion only (AC-5.2b, the status check). Everything else is demanded by the wording.
Note that 5.1, 5.2, 5.3 and 5.4 say *add*, *send*, *parse* and *log* — they are satisfied by doing
them and by 5.5 using the result, not by extra assertions, so none were invented.

## Observations (facts, 2026-11-26)

- `GET https://jsonplaceholder.typicode.com/users` answers **HTTP/2 200**,
  `content-type: application/json; charset=utf-8`, body **5645 bytes**, **0 redirects**, ~40 ms.
  Two consecutive requests returned a byte-identical body, so the data is stable test input.
- Response headers: `server: cloudflare`, `x-powered-by: Express`, `cache-control: max-age=43200`,
  `cf-cache-status: HIT`, `x-ratelimit-limit: 3600000` with `x-ratelimit-remaining: 3599999` — no
  practical throttling risk for a test suite.
- The body is a JSON **array of exactly 10 objects**, ids `1..10` in ascending order.
- Each object's top-level keys: `id`, `name`, `username`, `email`,
  `address` (`street`, `suite`, `city`, `zipcode`, `geo{lat,lng}`), `phone`, `website`,
  `company` (`name`, `catchPhrase`, `bs`). `name` and `email` are flat top-level strings — relevant
  because `company` *also* has a `name` and the object also carries a `username`.
- All 10 name/email pairs, in response order:
  `Leanne Graham | Sincere@april.biz`, `Ervin Howell | Shanna@melissa.tv`,
  `Clementine Bauch | Nathan@yesenia.net`, `Patricia Lebsack | Julianne.OConner@kory.org`,
  `Chelsey Dietrich | Lucio_Hettinger@annie.ca`, `Mrs. Dennis Schulist | Karley_Dach@jasper.info`,
  `Kurtis Weissnat | Telly.Hoeger@billy.biz`, `Nicholas Runolfsdottir V | Sherwood@rosamond.me`,
  `Glenna Reichert | Chaim_McDermott@dana.io`, `Clementina DuBuque | Rey.Padberg@karina.biz`.
- The first two entries are **exactly** the two example lines in step 5.4, so the example documents
  the real data and the required output format, not a sample to invent.
- Every one of the 10 emails contains exactly one `@`; the first one, `Sincere@april.biz`, does — so
  step 5.5 passes against the live API as written.
- The endpoint is fully public: **no** authentication, API key, cookie or custom header; a GET has no
  request body.
- `@playwright/test` 1.39.0 — the version Case 0 pinned, and the only test dependency in
  `package.json` — already ships a REST API request library, so 5.1 needs no new package and the
  Case 0 lockfile pin stays untouched.
- `playwright.config.ts` sets `baseURL https://www.saucedemo.com` for the browser cases and declares a
  single project, `firefox`. This case's host is a different one, so its request must address the host
  of step 5.2 rather than rely on the project base address.
- This case needs no browser page at all; it only has to run inside the same `npm test` suite.

## Decisions (ambiguities resolved)

| Question | Decision | Risk |
|---|---|---|
| 5.1 says "Add Rest Api library" without naming one. Install a third-party HTTP client (axios, supertest, node-fetch) or use what the framework already provides? | Use the REST API request library that comes with the pinned `@playwright/test` 1.39.0. It is a real REST API library, needs no new dependency, and keeps Case 0's exact-version pin and lockfile (which the Case 0 criteria check) untouched, while the case still runs under the same `npm test`. | low |
| 5.2 gives host and endpoint separately. Should the host be the project's configured base address? | No. The project base address belongs to the Swag Labs browser cases; this case addresses the host named in 5.2 for its own request. How that host is supplied is the Coder's choice; what matters is that the GET lands on `/users` of that host. | low |
| 5.2 says only "create and send". Should the test assert anything about the response? | Nothing beyond one successful-status check (AC-5.2b, marked `added`). Sending is satisfied by sending; no header, timing, schema or count assertions are invented. | low |
| 5.4 says "names and emails" — which keys, given the response also has `username` and a nested `company.name`? | The top-level `name` and `email` of each user object. The step's example lines match the top-level values of the first two users exactly, which settles it. | low |
| What does "log only" require — a format, a destination, an assertion on the output? | One line per user, name and email joined as in the example (`name \| email`), nothing else from the response on the line, emitted to the test run's standard output in response order. "Log" is an action: producing those lines satisfies it, so no assertion is made on the logged text. | low |
| 5.5 says "the first email address" — first in the response, first logged, or first alphabetically? | The email of the first element of the parsed response array, i.e. the same user whose line is logged first (`Sincere@april.biz`). Response order is stable across requests (id 1 first) and 5.4 established that order, so "first" means first as received. | low |
| Should 5.5 be strengthened into a full e-mail format check, or extended to all 10 addresses? | No. The step asks for one address and one property: that it contains `@`. More addresses or a stricter pattern would invent requirements. | low |
| Which browser project does an API-only case belong to? | The suite's single existing project (`firefox`, chosen in Case 0 because 1.39.0's Chromium build crashes locally), so that one `npm test` runs everything — but the case opens no page and launches no browser window. | low |

## Test data

| Item | Value |
|---|---|
| REST API library | the request library bundled with `@playwright/test` 1.39.0 (pinned in Case 0); no new dependency |
| Request method | `GET` |
| Request host | the host given in 5.2 (`https://jsonplaceholder.typicode.com`) |
| Request endpoint | `/users` |
| Expected status | `200` (observed 2026-11-26) |
| Expected content type | `application/json; charset=utf-8` |
| Response shape | JSON array of 10 user objects, ids 1..10 ascending |
| Logged fields | each user's top-level `name` and `email` only |
| Log line format | `<name> \| <email>` — one line per user, in response order, as in the step's example |
| Expected first two log lines | `Leanne Graham \| Sincere@april.biz`, `Ervin Howell \| Shanna@melissa.tv` |
| First user email | `Sincere@april.biz` (observed 2026-11-26) |
| First-email assertion | contains the character `@` |
| Auth | none — public endpoint, no key, cookie or custom header |
| Browser project | `firefox` (the project browser chosen in Case 0); this case opens no page |

## Requirement deviations

_None._ The live API satisfies every step as written: the GET returns 200 with JSON, the data carries
top-level `name`/`email` for all 10 users, and the first email (`Sincere@april.biz`) contains `@`.
