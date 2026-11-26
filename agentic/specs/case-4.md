# Case 4 – iFrame and tab handling

## Summary

Exercise iframe and tab handling on the Guru99 demo home page. The test opens the address named in
step 4.1, reaches into the small banner iframe that sits just above the **Email Submission**
heading and clicks the image inside it, validates the title of the page that opens in the second
tab, closes that tab and carries on in the first one, then hovers the top menu's **Testing** item,
clicks the **Selenium** link the hover reveals, and validates that the sign-up call-to-action button
near the bottom of the page that loads is displayed.

Two values the steps name no longer exist on the live site and are amended: the expected tab title
(**D-4.3**) and the wide red *Join Now* button (**D-4.6**). Everything else works as written.

## Steps: original → refined

| ID | Original | Refined (observable) |
|---|---|---|
| 4.1 | Open this url http://demo.guru99.com/test/guru99home | The test's entry point is the address named in the step, opened directly (a different host from the project's configured base address, which belongs to the Swag Labs cases). The server answers an anonymous visitor with a 301 to the same path over https, so the loaded page settles on the https address with a trailing slash and shows the demo home page titled `Demo Guru99 Page`. There is no login, cookie or consent wall. The tab opened here is the **main window** of step 4.4. |
| 4.2 | Locate the image inside the iframe near bottom of the page just above Email Submission and click on it | Near the bottom of that page, directly above the `Email Submission` heading, sits a small banner iframe (750×110 px, its own document on the same host) whose entire content is one clickable image wrapped in a link. The test reaches into **that** iframe — not the YouTube player iframe near the top — and clicks the image. The iframe's document sets its links to open in a new browsing context, so the click opens a second tab instead of navigating in place. |
| 4.3 | Verify new page is loaded in new tab with title: Selenium Live Project: FREE Real Time Project for Practice | The click of 4.2 opens a second tab; the test waits for it and asserts that the loaded page's title is exactly the title of the Live Selenium Project page. The literal the step names no longer exists — the page is titled `Selenium Live Project for Practice` today — so the expected title is amended to that value (**D-4.3**). The page from 4.1 stays open in the first tab. |
| 4.4 | Close this tab and switch back to main window | The test closes the tab opened in 4.3 and carries on in the tab opened in 4.1, which still shows the demo home page; from here on all interaction happens there, and it is the only tab left open. |
| 4.5 | From top menu click on Selenium link that can be seen while hovering on Testing menu item | Back in the main tab, the test hovers the top menu's `Testing` item, which reveals its drop-down (its items are parked far off-screen to the left until the parent is hovered), and clicks the item labelled exactly `Selenium` — not the `Selenium` entry in the dark strip at the very top of the page, which links nowhere, and not the drop-down's `Live Selenium Project`. The click navigates the same tab to the Selenium tutorial page; no further tab opens. |
| 4.6 | Verify the wide red Join Now button is displayed near bottom of the page | On the page loaded by 4.5 the test asserts that the page's sign-up call-to-action near the bottom — the button labelled `Subscribe for Free` in the newsletter block, the last call to action before the footer link lists — is displayed. No `Join Now` button exists on that page any more, so the element is amended (**D-4.6**). It sits below the fold, so the check may need it brought into view. |

## Acceptance criteria

| ID | Step | Criterion | Source |
|---|---|---|---|
| AC-4.1 | 4.1 | The first page the test opens is the address named in step 4.1, and the demo home page it serves is loaded before the test interacts with it. | original |
| AC-4.2 | 4.2 | The test clicks the clickable image inside the small banner iframe just above the `Email Submission` heading near the bottom of that page, reaching into the iframe's own document rather than clicking anything in the main document or in the video iframe near the top. | original |
| AC-4.3 | 4.3 | After that click a second tab is open, and the test asserts that the page loaded in it has the title `Selenium Live Project for Practice` (the step's literal amended by D-4.3). | original |
| AC-4.4 | 4.4 | The tab opened in step 4.3 is closed and the remaining steps run in the tab opened in step 4.1, which still shows the demo home page. | original |
| AC-4.5 | 4.5 | In the main tab the test hovers the top menu's `Testing` item and then clicks the `Selenium` item the hover reveals in its drop-down, and the page that click loads is where the remaining check happens. | original |
| AC-4.6 | 4.6 | The test asserts that the sign-up call-to-action button near the bottom of the page reached in step 4.5 — the one labelled `Subscribe for Free` — is displayed (the step's element amended by D-4.6). | original |

No `added` criteria. In particular there is **no** assertion on the number of tabs beyond what 4.3
and 4.4 need, no URL assertion, no check on the intermediate `Selenium Tutorial – Guru99` title and
no coordinate check for "near bottom".

## Observations (facts, 2026-11-26)

Explored in the Playwright MCP browser (headless Chrome, 1280×720, fresh profile) and with `curl`.
The suite itself runs on the project browser **Firefox**; nothing relied on below is
browser-specific — the new tab comes from the iframe document's own `base target`, the drop-down
from the page's CSS, the page texts from the served HTML.

- `http://demo.guru99.com/test/guru99home` answers **301 Moved Permanently** to the https address;
  the browser settles on `https://demo.guru99.com/test/guru99home/` (trailing slash). Title
  `Demo Guru99 Page`. No login, cookie banner or consent dialog. 11 console errors on load, all
  from third-party scripts, none blocking.
- The page contains exactly **2 iframes**: a YouTube player (`https://www.youtube.com/embed/RbSlW8jZFe8`,
  560×315) at document y 297, and a same-host banner iframe (`ads.html`, id/name `a077aa5e`,
  750×110) at document y 2499. The `Email Submission` heading starts at y 2659, directly below that
  second iframe. The document is 3467 px tall.
- The banner iframe's whole document is
  `<head><base target="_blank"></head><body><a href="http://www.guru99.com/live-selenium-project.html"><img src="Jmeter720.png"></a></body>`.
  The image is 728×90 with **no alt text**; the link itself has no `target` — the document-level
  `<base target="_blank">` is what opens a new tab. The heading just above the iframe warns
  *iFrame will not show if you have adBlock extension enabled*; with no ad blocker the iframe and
  its image loaded on every visit.
- Clicking the image opened a second tab at `https://www.guru99.com/live-selenium-project.html`
  (the http link 301-redirects to https behind Cloudflare). Its title **and** its `h1` are
  `Selenium Live Project for Practice`; `FREE Real Time Project` occurs nowhere in the served HTML
  (→ **D-4.3**). The first tab kept showing the demo page; closing the second left exactly one tab.
- Top menu of the demo page: Home, **Testing**, SAP, Web, Fun, Blog, Quiz, Execute online. The
  `Testing` item links to `software-testing.html` and carries a CSS drop-down with Manual Testing,
  QTP, **Selenium**, Performance Testing, Quality Center, Mobile Testing, Live Testing Project,
  Test Management, Live Selenium Project, Enterprise Testing.
- Before the hover the drop-down's `Selenium` item is rendered but parked **off-screen at
  x = −16308** (y 345, 170×42); hovering `Testing` moves it to x = 675, y = 345 inside the viewport.
  It links to `https://www.guru99.com/selenium-tutorial.html` with no `target`, so the click
  navigates the same tab; afterwards one tab remains, titled `Selenium Tutorial – Guru99`.
- A **second link labelled `Selenium`** sits in the dark strip at the very top of the demo page,
  above the logo. Its href is `#` and it leads nowhere — a decoy for step 4.5.
- On `selenium-tutorial.html` the string **`Join Now` occurs zero times**, both in the HTML served
  by curl and in the rendered text after scrolling the whole document (5599 px on load, 6598 px
  once lazy content loaded). The only `join` is the heading *Learn Selenium in 7 Days! / Join our
  FREE Course* of a block **injected by a third-party script** (absent from the served HTML) at
  y 2340 of 6598 — mid-page, with a wide red (`rgb(244,53,0)`, 520 px) `Submit` button. Nothing
  near the bottom is wide and red; the only red control there is the 85 px `Next →` link.
  (→ **D-4.6**.)
- The last call to action before the footer link lists is the newsletter block *Sign up for the
  newsletter / **Subscribe for Free** / Chosen by over 350,000+ professionals*: `button#submitBtn`,
  270×52 px, background `rgb(255,193,7)`, at document y 5753 (of the 5599 px measured on load, i.e.
  at the very bottom of the document as first rendered). It comes from the page's **own served
  HTML** (`<form id="makeForm">`), occurs exactly once, and is visible without any interaction,
  though below the fold.
  (Screenshot: [`docs/evidence/case-4/selenium-page-bottom-no-join-now.png`](../../docs/evidence/case-4/selenium-page-bottom-no-join-now.png).)
- `www.guru99.com` sits behind Cloudflare (a `__cf_bm` cookie is set); no bot challenge or
  interstitial was served to the exploration browser or to curl. The tutorial page shows no cookie
  banner and no fixed overlay that could intercept clicks.

## Decisions (ambiguities resolved)

| Question | Decision | Risk |
|---|---|---|
| 4.2 says "the iframe", but the page has two. Which one? | The small banner iframe directly above the `Email Submission` heading near the bottom — the step locates it by exactly that landmark. The other iframe is the YouTube player near the top and holds no such image. | low |
| 4.3 says "with title: …" — exact match or substring? | Exact equality against the amended literal `Selenium Live Project for Practice`. The step quotes a complete page title, so the original strength is an equality check; only the value changes (D-4.3). | low |
| Which `Selenium` link does 4.5 mean — the dark-strip one, the drop-down's `Selenium`, or `Live Selenium Project`? | The drop-down item labelled exactly `Selenium`: the step defines it as the link that becomes visible while hovering `Testing`. The dark-strip link has href `#`, and `Live Selenium Project` is a different label. | low |
| Must the drop-down really be opened by hovering, or may the test click the hidden link directly? | By hovering `Testing` first — the step says so, and the item is parked ~16 000 px off-screen until the parent is hovered, so the hover is what makes it reachable the way a user reaches it. | low |
| Does "near bottom of the page" in 4.6 have to be asserted (coordinates)? | No. The phrase says where the element sits; the verb is "is displayed", so the check is that the named element is displayed. A coordinate range would be an invented requirement. | low |
| 4.6 names an element that no longer exists. Which element inherits the check? | The page's sign-up call to action near the bottom: the `Subscribe for Free` button of the newsletter block. It is part of the page's own served HTML, occurs once and is the last call to action before the footer, so it keeps the step's position and role. The wide red *Join our FREE Course* Submit button keeps the colour and the word "join" but is injected by a third-party script and sits mid-page — that would trade a stable anchor for an unstable one. See D-4.6. | medium |
| 4.1 names an http address the server redirects to https. Follow it or assert the address? | Navigate exactly as the step writes it and let the redirect happen; no step asks for a URL assertion, so none is made. | low |
| Which browser project, given the exploration ran in headless Chrome? | The suite's existing `firefox` project (chosen in Case 0 because 1.39.0's Chromium build crashes locally), so one `npm test` still runs everything. Nothing in the criteria depends on a Chrome-specific detail. | medium |

## Test data

| Item | Value |
|---|---|
| Entry page | the address given in 4.1 (`http://demo.guru99.com/test/guru99home`), opened directly, not via the project base address; 301-redirects to `https://demo.guru99.com/test/guru99home/` |
| Entry page title | `Demo Guru99 Page` |
| Target iframe | the small banner iframe just above the `Email Submission` heading (same-host `ads.html`, name/id `a077aa5e`, 750×110) — not the YouTube iframe near the top |
| Target element in the iframe | its single clickable image (728×90, no alt text) inside a link to `http://www.guru99.com/live-selenium-project.html`; the iframe's `<base target="_blank">` makes the click open a new tab |
| New tab URL | `https://www.guru99.com/live-selenium-project.html` |
| Expected new tab title | `Selenium Live Project for Practice` (exact; the step's literal is amended, see D-4.3) |
| Tabs after 4.4 | one — the tab opened in 4.1, still showing the demo home page |
| Top-menu item to hover | `Testing` |
| Menu link to click | the drop-down item labelled exactly `Selenium` (`https://www.guru99.com/selenium-tutorial.html`), parked at x = −16308 until `Testing` is hovered |
| Decoy | a second `Selenium` link in the dark strip at the very top of the demo page, href `#` |
| Page after the menu click | `https://www.guru99.com/selenium-tutorial.html`, title `Selenium Tutorial – Guru99`, same tab |
| Expected bottom element | the button labelled `Subscribe for Free` in the *Sign up for the newsletter* block (`button#submitBtn`, 270×52, in the page's own served HTML); the step's "wide red Join Now button" is amended, see D-4.6 |
| Its position | document y 5753 with the document 5599 px tall on load — below the fold |
| Browser project | `firefox` (the project browser chosen in Case 0) |

## Requirement deviations

**D-4.3: The new tab's title no longer contains "FREE Real Time Project"**
- **Original:** Verify new page is loaded in new tab with title: Selenium Live Project: FREE Real Time Project for Practice
- **Amended:** Verify new page is loaded in new tab with title: Selenium Live Project for Practice
- **Why the original can't be fulfilled:** The image in the iframe links to `www.guru99.com/live-selenium-project.html`, and on 2026-11-26 that page's title — in the browser and in the HTML served by curl — is `Selenium Live Project for Practice`. The string `FREE Real Time Project` occurs nowhere in the page, so the title the step names cannot be observed any more; the site renamed the page since the homework was written.
- **Why this amendment:** Only the expected literal changes, to the title the same page carries today; the step keeps its subject (a new tab opened by the click of 4.2) and its strength (an exact title comparison). A runtime-derived expectation is not an option here: deriving the title from the page under test would make the assertion tautological.
- **Evidence:** [`docs/evidence/case-4/new-tab-title.md`](../../docs/evidence/case-4/new-tab-title.md)

**D-4.6: The Selenium page has no "Join Now" button any more**
- **Original:** Verify the wide red Join Now button is displayed near bottom of the page
- **Amended:** Verify the sign-up call-to-action button near the bottom of the page — the button labelled `Subscribe for Free` in the newsletter block — is displayed
- **Why the original can't be fulfilled:** The page reached in 4.5 is `www.guru99.com/selenium-tutorial.html`, and on 2026-11-26 the string `Join Now` occurs zero times there, both in the served HTML and in the rendered text after the whole document is scrolled. Nothing near the bottom is a wide red button: the last call to action before the footer is the 270×52 px amber `Subscribe for Free` button, and the only red control in that region is an 85 px `Next →` link. The page was redesigned since the homework was written.
- **Why this amendment:** The check keeps everything the step still allows — the same page, the same position (the last call to action before the footer), the same role (a free sign-up button) and the same strength (one is-displayed assertion on one named element). Only the element's identity moves to the button that occupies that place today, chosen because it is part of the page's own served HTML, while the one remaining wide red "join" button is injected by a third-party script and sits mid-page.
- **Evidence:** [`docs/evidence/case-4/selenium-page-bottom-no-join-now.md`](../../docs/evidence/case-4/selenium-page-bottom-no-join-now.md)
