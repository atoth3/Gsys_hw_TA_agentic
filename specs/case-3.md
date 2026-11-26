# Case 3 – Rich Text Editor

## Summary

Type one formatted sentence into the CKEditor-powered rich text editor on the public online HTML
editor page named in step 3.1, and check the result. The editor starts empty, so the test types
**Automation Test Example** into its main editing area with the keyboard, applies the editor's own
**bold** format to the word `Automation` and the editor's own <u>underline</u> format to the word
`Test`, and then validates that the editing area shows exactly `Automation Test Example` with those
two words carrying those two formats.

No amendment is needed: every step works as written on the live site today.

## Steps: original → refined

| ID | Original | Refined (observable) |
|---|---|---|
| 3.1 | Open the url: https://onlinehtmleditor.dev | The test's entry point is the address named in the step, opened directly (a different host from the project's configured base address, which belongs to the Swag Labs cases). The page answers an anonymous visitor with the *Online HTML Editor* page and, once its scripts have run, a rich text editor made of a toolbar and a main editing area. That editing area is **empty**: the `Type or paste your content here!` line it displays is the editor's placeholder, not content. |
| 3.2 | Type the following text to the editor: Automation Test Example | The test puts the caret in the editor's main editing area and enters `Automation Test Example` there **with the keyboard** — the three words in that order, separated by single spaces — rather than pasting it or writing it through the editor's source view. Afterwards that one line is the editor's whole content. |
| 3.3 | Automation text should be typed bold format | The word `Automation` carries the editor's **bold** format, applied through the editor's own Bold control (toolbar button or its keyboard shortcut) while the word is typed or while it is selected, and the test checks that the word really is bold in the editor's content. The other two words and the separating spaces stay as typed. |
| 3.4 | Test text should be typed underline format | The word `Test` carries the editor's **underline** format, applied through the editor's own Underline control (toolbar button or its keyboard shortcut) while the word is typed or while it is selected, and the test checks that the word really is underlined in the editor's content. `Automation` stays bold, `Example` stays unformatted. |
| 3.5 | Validate the text is appearing in the rich text editor | The test asserts that the editor's main editing area is visible and that the text it shows is exactly `Automation Test Example` — the three words separated by single spaces, and nothing else in the editor. |

## Acceptance criteria

| ID | Step | Criterion | Source |
|---|---|---|---|
| AC-3.1 | 3.1 | The first and only page the test opens is the address named in step 3.1, and the test works on the rich text editor that page provides. | original |
| AC-3.2 | 3.2 | The test enters the text `Automation Test Example` into the editor's main editing area with the keyboard (not by pasting it or by writing markup through the source view), and that text is the editor's whole content afterwards. | original |
| AC-3.3 | 3.3 | The word `Automation` in the editor's content is in bold format, applied through the editor's own bold control, and the test asserts that it is bold. | original |
| AC-3.4 | 3.4 | The word `Test` in the editor's content is in underline format, applied through the editor's own underline control, and the test asserts that it is underlined. | original |
| AC-3.5 | 3.5 | The test asserts that the editor's main editing area is visible and that the text it shows is exactly `Automation Test Example`. | original |

No `added` criteria: every check comes from the original wording. In particular there is **no**
negative check that nothing else is bold or underlined, and no assertion about the consent banner,
the toolbar state or the generated markup beyond the two formatted words.

## Observations (facts, 2026-11-26)

Explored in the Playwright MCP browser (headless Chrome 158, 1280×720, fresh profile). The suite
itself runs on the project browser **Firefox**; everything relied on below comes from the editor's
own behaviour or the page's CSS, not from a browser-specific API.

- `https://onlinehtmleditor.dev` answers 200 at that exact address — no redirect to another host, no
  login wall. Title: `Free online HTML editor - Word to HTML | Onlinehtmleditor.dev`, heading
  *Online HTML Editor*, *powered by CKEditor*.
- The editor is **CKEditor 5 rendered inline in the main document — there is no iframe anywhere on
  the page** (0 iframes). The editing area is a `contenteditable` region exposed as a textbox named
  `Rich Text Editor. Editing area: main. Press ⌥0 for help.`, inside an application region named
  *Rich Text Editor*.
- The editing area is **empty on load**: its markup is
  `<p class="ck-placeholder" data-placeholder="Type or paste your content here!"><br></p>` and its
  text is empty. The visible sentence is a CSS placeholder, so an exact comparison of the editor's
  text against the typed sentence is both possible and meaningful.
- The toolbar exposes separate buttons named `Bold`, `Italic`, `Underline`, `Strikethrough`, plus
  `Source`, `Select all`, `Remove Format` and others. `Bold` and `Underline` are toggles carrying
  `aria-pressed`, observed flipping to `true` when the format is on and back to `false` when off.
- Their tooltips name the shortcuts as `Bold (⌘B)` / `Underline (⌘U)` on macOS; on the Linux CI
  runner the same shortcuts are Ctrl-based. A shortcut-driven implementation therefore needs the
  platform-neutral modifier, while clicking the toolbar buttons is platform-independent.
- **Verified sequence A (type plain first, then format):** click the editing area, type
  `Automation Test Example`, select the word `Automation` and press Bold, select the word `Test` and
  press Underline. Result: `<p><strong>Automation</strong> <u>Test</u> Example</p>`, the editing
  area's text exactly `Automation Test Example`. Computed styles: `Automation` font-weight 700 and
  text-decoration none, `Test` text-decoration underline and font-weight 400.
  (Screenshot: [`docs/evidence/case-3/editor-formatted-text.png`](../docs/evidence/case-3/editor-formatted-text.png).)
- **Verified sequence B (toggle formats while typing)** — Bold on, type `Automation`, Bold off, type
  a space, Underline on, type `Test`, Underline off, type ` Example` — looks identical but leaves
  **seven zero-width U+2060 WORD JOINER fillers** right after the underlined word: the text reads
  `Automation Test⁠⁠⁠⁠⁠⁠⁠ Example`. The fillers survive blurring
  the editor, so an exact text comparison fails against them although the page looks correct.
  Sequence A avoids them entirely.
- Selecting a single word works both by double-clicking it in the editing area and by keyboard
  (caret to line start, arrow right past the preceding words, shift+arrow right over the word);
  both yielded exactly the intended word as the selection.
- A **cookie-consent dialog** (CookieHub: *Deny all* / *Allow all cookies* / *Cookie settings*) is
  fixed to the **bottom** of the viewport, 122 px tall, z-index 700001. It covers the lower part of
  the editing area but never the toolbar nor the first line of the editing area; clicking into the
  editing area and clicking toolbar buttons both worked with the banner left in place. Dismissing it
  is optional.
- **Hazard at the top of the viewport:** the site's own header is `position: sticky; top: 0` with
  z-index 2000, and CKEditor's toolbar becomes a panel fixed at `top: 0` with z-index **1000** once
  the page is scrolled past the editor. The header then completely covers the toolbar and a toolbar
  click is refused as intercepted (observed: a 30 s click timeout at scroll offset 402 with
  `div.b-header__main … intercepts pointer events`). Keeping the page at or near the top — where the
  toolbar sits around y ≈ 400, well clear of the 81 px header — keeps the buttons clickable;
  keyboard shortcuts sidestep the problem altogether.
- The page stores no editor content: after a run localStorage holds only a `device-id` key and
  sessionStorage is empty, so a fresh context always starts from an empty editor and a reload clears
  what was typed.
- The editing area carries `spellcheck="false"`; the bundled WProofreader widget reports
  `Suggestions: 0` and adds no markup to the typed sentence.
- No console errors on load or during the flow (warnings only, from third-party scripts). No ad
  iframe, interstitial or modal other than the consent banner appeared.

## Decisions (ambiguities resolved)

| Question | Decision | Risk |
|---|---|---|
| 3.3 and 3.4 say the words "should be typed bold/underline format" without saying *validate*. Are they pure actions, with 3.5 the only assertion? | Each is an action **plus one assertion on its result**. Applying a character format has no other observable consequence in the test, so without a check a run that typed plain text would pass a case whose whole subject is rich text formatting; "should be" states a requirement about the resulting content, and a refined step has to be checkable. One assertion per step, on the named word only. | low |
| 3.4 says "Test text" — the single word `Test`, or the whole typed test text? | The single word `Test`. The two steps are parallel and each names one word of the sentence from 3.2; reading 3.4 as the whole sentence would contradict 3.3, which leaves only `Automation` bold. `Example` and the spaces stay unformatted. | low |
| Must the formatting go through the editor's UI, or would any content with the right markup do (Source button, setting the editor's data)? | Through the editor's own Bold and Underline controls — 3.2–3.4 all say "typed". Which control, and whether the format is toggled while typing or applied to a selection afterwards, is the Coder's choice. | low |
| 3.5 "the text is appearing" — substring check or the editor's whole content? | The editing area's whole visible text must equal `Automation Test Example`. The editor is empty before the test types, so the exact comparison is available and is the honest reading of the step. It also catches the stray zero-width fillers that sequence B leaves behind. | low |
| The project's base address is the Swag Labs host of Cases 1 and 2. Use it here? | No. This case opens the absolute address named in 3.1, the way Case 5 addresses its own host. How that address is supplied is the Coder's choice. | low |
| Dismiss the cookie-consent banner, and assert anything about it? | No assertion either way, and dismissing is optional: the banner is pinned to the bottom of the viewport and was observed never to cover the toolbar or the first line of the editing area, and the whole flow succeeded with it untouched. Dismissing it is a robustness choice for the Coder. | low |
| Which browser project, given that the exploration ran in headless Chrome? | The suite's existing `firefox` project (chosen in Case 0 because 1.39.0's Chromium build crashes locally), so one `npm test` still runs everything. Nothing in the criteria depends on a Chrome-specific detail: the markup and the fillers come from CKEditor, the toolbar/header overlap from the page's CSS. | medium |
| How should "bold" and "underline" be observed — markup, computed style, or the toolbar button's pressed state? | The Coder's choice; the criterion is that the word really carries the format in the editor's content. All three signals observed today are recorded above. The toolbar button's pressed state alone is weaker — it reflects the caret, not the content — so it should not be the only evidence. | low |

## Test data

| Item | Value |
|---|---|
| Entry page | the address given in 3.1 (`https://onlinehtmleditor.dev`), opened directly, not via the project base address |
| Editor | the page's single rich text editor (CKEditor 5, inline in the main document — no iframe); main editing area = the textbox named `Rich Text Editor. Editing area: main.` |
| Initial editor content | empty (the visible `Type or paste your content here!` line is a placeholder attribute) |
| Text to type | `Automation Test Example` |
| Bold word | `Automation` |
| Underline word | `Test` |
| Unformatted word | `Example` |
| Input method | keyboard typing into the editing area; formats via the editor's own Bold and Underline controls |
| Expected editor text | exactly `Automation Test Example` (the editing area's whole visible text) |
| Observed markup | `<p><strong>Automation</strong> <u>Test</u> Example</p>` (2026-11-26) |
| Observed computed styles | `Automation` font-weight 700, text-decoration none; `Test` text-decoration underline, font-weight 400 |
| Known trap | toggling a format off mid-typing leaves seven zero-width U+2060 word joiners after the underlined word; typing the plain sentence first and formatting afterwards is clean |
| Cookie banner | CookieHub dialog fixed to the viewport bottom; blocks neither the toolbar nor the first line of the editing area, dismissing optional |
| Browser project | `firefox` (the project browser chosen in Case 0) |

## Requirement deviations

_None._ Every step of Case 3 is fulfillable as written on the live site today.
