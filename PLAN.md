# Agentic Homework Pipeline: Plan

Goal: solve the Genesys TypeScript/Playwright homework (5 cases) **with a local multi-agent workflow** instead of by hand, then compare the result with the manual solution in `../Gsys_hw_TA`.

It builds on the `ai-bootcamp` Step 7 swarm (`my-work/07-swarm/swarm.ts`): writer → reviewer ⇄ fixer, worktree isolation, STATUS contracts, deterministic test gates, and the oracle rule. This plan adds two new roles: an **Analyst** that explores and refines each requirement before any code is written, and an **Acceptance** check against the *original* wording at the end.

---

## 1. The big picture

```
requirements/homework.md   (original text, transcribed from the PDF, never edited by agents)
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR  (orchestrator.ts: deterministic code, NOT an LLM)        │
│ for each case: 0 (setup), 1, 2, 3, 4, 5 — sequentially                 │
└─────────────────────────────────────────────────────────────────────────┘
        │
        │  per case
        ▼
 ① ANALYST ──────► refined spec  (specs/case-N.md + case-N.json)
   explores the live site/API, writes behavioural acceptance criteria,
   lists ambiguities + decisions. No code.
        │
        ▼
 ② CODER ────────► tests/, pages/, test/resources/...   (commit)
        │
        ▼
 ③ GATE (code) ──► tsc --noEmit · playwright test · --repeat-each=3
        │
        ▼
 ④ REVIEWER ⇄ CODER (resumed)   max 3 rounds, JSON verdict {ship, issues[]}
        │
        ▼
 ⑤ ACCEPTANCE ───► sees the ORIGINAL requirement (not the refined spec) + final code
   (Analyst role,   + test results + README deviations / CI limitations + reviewer spec-gaps
    fresh session)  verdict ACCEPT / REJECT with a per-step traceability table
        │  REJECT → coder → gate → reviewer → acceptance once more; REJECT again → case failed, next case
        ▼
 ⑥ PUBLISH (code) ► commit "Case N: …"; with --merge: push + PR to main
        │
        ▼
 ⑦ CI GATE (GitHub Actions, --merge only) ► full suite on a clean Linux runner
        │
        ▼
 ⑧ MERGE (code) ► all gates green → squash-merge (main with --merge, local integration branch otherwise);
                                    next case branches from it
                  any gate red   → PR stays as draft; next case continues without it
```

### Why the orchestrator is code, not an agent

You described an "orchestrator agent". I recommend a **TypeScript script** instead, for the same reason as in Step 7: everything that decides *pass / fail / continue / stop* must be deterministic. An LLM orchestrator can "decide" that red tests are fine, forget a step, or ask a question nobody can answer. The script:

- feeds cases one by one,
- starts each agent with exactly the context it needs (no more),
- validates every handoff contract (JSON schema + `STATUS:` line),
- runs the tests itself and never trusts an agent's "they pass",
- enforces budgets (rounds, turns, time),
- writes `report.md` even when the run fails.

The LLMs do the judgment work: understanding, exploring, coding, reviewing.

---

## 2. Inputs

### `requirements/homework.md`
The PDF transcribed verbatim, split into sections so the orchestrator can hand them out one at a time:

| ID | Title | Notes |
|---|---|---|
| 0 | Preconditions | Node ≥ 18, Playwright **1.39.0** (exact pin), test runner script in `package.json` |
| 1 | Automate Purchase Process | saucedemo, `test/resources/credential.json`, `performance_glitch_user` |
| 2 | Verify error messages for mandatory fields | saucedemo, footer must contain `2023` and `Terms of Service` |
| 3 | Rich Text Editor | onlinehtmleditor.dev, bold + underline |
| 4 | iFrame and tab handling | demo.guru99.com, iframe click → new tab, hover menu |
| 5 | REST API testing | jsonplaceholder `/users`, "add a REST API library" |
| — | "Upload your code to GitHub" | handled by Publish + Merge (⑥–⑧ with `--merge`), not a case |
| X1 | *Ours, not in the PDF:* tests run in CI on GitHub Actions | added to Case 0 (section 13), so the Analyst and Acceptance treat it like any other requirement |

Case 0 runs first and creates the project skeleton (`package.json`, `playwright.config.ts`, `tsconfig.json`, folder layout, the CI workflow from X1, and one smoke test so CI has something to run). Every later case builds on it.

### Contamination guard
The manual solution lives next door in `../Gsys_hw_TA`. Agents **must not read it**: they'd copy it, and the comparison would be worthless. Prompts and `--allowedTools` alone aren't enough, because read tools can usually reach files outside the working folder without asking. So the guard has three layers:
1. **Deny rules:** every Claude agent gets `--disallowedTools "Read(//<abs path>/Gsys_hw_TA/**)" "Bash(*Gsys_hw_TA/*)" "Bash(*file://*)"` plus the same rules in the `permissions.deny` of its `--settings`. Note the **double slash**: in Claude Code permission rules `//path` is an absolute path, while `/path` is relative to the settings file (verified during the build: `Read(//…/secret/**)` blocks the Read tool with "File is in a directory that is denied"). The trailing `/` matters: the run's own worktree is `../Gsys_hw_TA_agentic-run-<stamp>`, which a bare `*Gsys_hw_TA*` would also block. Codex runs with its working root set to the worktree; its read-only sandbox can still *read* outside it, so for Codex the audit (layer 3) is the real guard.
   **Added during the build:** the same deny list also covers your own checkout (`Read(//<repo>/**)`, which holds earlier runs' logs) and, inside the run worktree, `PLAN.md` and `pipeline/**`. `PLAN.md` contains the "known traps" table (section 5), and an agent that reads it would be told the answers.
   The Analyst's Playwright MCP is limited to the case sites' `http(s)` origins (`analyst-mcp.json`), so it can't open `file://…/Gsys_hw_TA/`.
2. **Prompt rule:** "Only read files inside the current working directory."
3. **Audit:** after each agent call, the orchestrator searches the agent's transcript for the manual solution's path: `Gsys_hw_TA` **not** followed by a word character or `-` (regex `/Gsys_hw_TA(?![\w-])/`, so `../Gsys_hw_TA` without a slash is caught too, while `Gsys_hw_TA_agentic…` is not). It checks only what the agent **asked for**: Claude's `tool_use` inputs (from `--output-format stream-json --verbose`) and Codex's command events (`--json`). Searching tool *results* would give false hits whenever a repo file mentions the folder. A hit marks the run **contaminated** in `report.md`; it can still finish, but its results don't count for the comparison.

After the run, we compare the two solutions ourselves (section 9).

---

## 3. Roles

### ① Analyst (refine + explore)
**Job:** turn one original requirement into a refined, testable spec. It describes *behaviour*, not code.

- **Input:** the original case text, the current project layout (`git ls-files`), the specs of earlier cases (for consistency).
- **Tools:** a browser to explore the live page (Playwright MCP or `npx playwright` scripts in a scratch folder), `curl` for the API. It may write only `specs/`, `docs/evidence/case-N/` and its own case subsection of the README's "Requirement deviations"; everything else is read-only.
- **Output:** `specs/case-N.md` (for humans) + `specs/case-N.json` (for the pipeline):

```jsonc
{
  "case": 2,
  "summary": "Empty login shows an error; after login the footer shows year and ToS",
  "preconditions": ["Start from the inventory URL; site redirects to login"],
  "steps": [
    { "id": "2.1", "original": "Open the url …/inventory.html", "refined": "Navigate to /inventory.html; expect redirect to the login page" },
    { "id": "2.3", "original": "Validate the error message", "refined": "Error banner text equals 'Epic sadface: Username is required'" }
  ],
  "acceptance_criteria": ["…observable, checkable statements…"],
  "observations": ["What the analyst actually saw on the live site (texts, redirects, timings)"],
  "ambiguities": [
    { "question": "Step 2.3 says 'validate the error message' but doesn't give the text", "decision": "Assert the exact message shown for an empty username (see observations); it is the site's documented validation, not a guess", "risk": "low" }
  ],
  "deviations": [
    {
      "step": "2.6",
      "original": "Validate the footer message contains 2023 and Terms of Service",
      "amended": "Validate the footer contains the current year and Terms of Service",
      "why_unfulfillable": "The live footer shows '© 2026 Sauce Labs'. 2023 is not on the page, so the step can't pass as written",
      "evidence": "docs/evidence/case-2/footer.png + observed text, checked 2026-11-25",
      "why_this_amendment": "Keeps the intent (the footer shows a copyright year and the ToS link) with the smallest change"
    }
  ],
  "test_data": { "username": "standard_user" },
  "status": "DONE"
}
```

**Rules:** no selectors, no code (that's the coder's job; "refined but not code-level"). Every original step must map to at least one refined step, so the traceability starts here. Ambiguities are *decided*, not asked: it runs unattended.

**The Analyst may change a requirement, but only if it can't be fulfilled as written.** The full policy is in section 4b. In short: it writes the amendment into the spec's `deviations` list **and** into the `README.md` "Requirement deviations" section, with the reasoning and evidence. The Coder implements the amended version; Acceptance checks the reason.

### ② Coder
**Job:** implement the refined spec as Playwright tests.

- **Input:** refined spec (md + json), the **original** case text (so it can't drift from the source), the project skeleton.
- **Tools:** `--permission-mode acceptEdits`, allow-list `Bash(npx playwright test:*)`, `Bash(npx tsc:*)`, plus `npm install`/`npm ci`/`npm test` and `npx playwright install` (Case 0 must create the lockfile and browsers, Case 5 must add a library). Editable paths: `tests/`, `pages/`, `test/resources/`, `utils/`, **`package.json` + `package-lock.json` (every case: Case 5's "add Rest Api library" needs them; the pin check guards Playwright)**, and its own case subsection of the README's **"CI limitations"** (section 4c). In Case 0 only, also the config files, `.github/workflows/` and the "how to run" part of `README.md` (the README skeleton comes from the orchestrator).
- **Output:** code + a summary + `STATUS: DONE | BLOCKED <reason>`.
- **Conventions** (written once in `CONVENTIONS.md`, given to coder and reviewer): Page Object Model, role/text-based locators, no `waitForTimeout`, one spec file per case, test titles that start with the case ID, and the general CI-limitations rule from section 4c (no site named).

### ③ Gate (deterministic, in the orchestrator)
0. `npm ci` whenever the lockfile changed (so a lockfile that doesn't match `package.json` fails here, not first in CI), then `npx playwright install` once per run.
1. `npx tsc --noEmit`: type errors are a **hard error**.
2. + 3. **One run:** `npx playwright test tests/case-N- --repeat-each=3 --retries=0` with the line + JSON reporters. Per test: all repeats pass = passed, all fail = failed, mixed = **flaky**, treated as a failure, not "green 2 out of 3". (`performance_glitch_user` and guru99's ads make this case-relevant.) A case test that is *skipped* locally also makes the gate red (section 4c condition 1 needs a local pass).
   **Hard errors** (tsc, broken suite, path guard, pin, deviation mismatch, actionlint) go straight back to the Coder as a fix round without calling the Reviewer: there is nothing worth reviewing yet. Such a round counts toward `MAX_ROUNDS`.
4. Per-test diff against the previous run: tests that **flip pass → fail** or **disappear** are handed to the reviewer to judge (the Step 7 lesson: fewer passing tests isn't automatically a regression).
5. Guard: `git diff --name-only` must stay inside the allowed paths (including the README subsection rule from section 6), and `package.json` must still pin `@playwright/test` to `1.39.0`.
6. Deviation check (section 4b): spec `deviations[]` and README entries match one-to-one, and every evidence file exists.
7. Case 0 only: `actionlint` on `.github/workflows/*.yml`, so a broken workflow is caught locally before it's pushed.
8. **Final gate before commit:** the **full suite** (all merged cases, not just case N) with `CI=true --retries=0`. It uses the same config as CI (reporters, `forbidOnly`) but without the retry, so flakiness isn't hidden and a change that breaks an earlier case is caught locally.

### ④ Reviewer (different model)
**Job:** strict QA code review. Codex (`codex exec -s read-only`) by default, since a different model is a better critic; Claude as a fallback.

- **Input:** diff, refined spec, original case text, gate output, coder summary, `CONVENTIONS.md`.
- **Output (JSON contract, validated by the orchestrator):**
  ```json
  { "ship": true, "reason": "", "issues": [ { "file": "", "kind": "test|spec-gap|site-issue", "severity": "high|medium|low", "problem": "", "fix": "" } ] }
  ```
- **Issue kinds:**
  - `test`: a problem in the test code. Goes to the coder.
  - `spec-gap`: the refined spec missed or weakened something from the original. The coder can't fix the spec, so these are passed to **Acceptance** as hints (⑤).
  - `site-issue`: the site really misbehaves against a requirement that's still meant (section 4b "not allowed" list). The test correctly fails; it's reported, not fixed.
- **Loop:** only `high` **test** issues trigger another round. The fixer is the **coder resumed** (`--resume <session>`), so it remembers its own reasons. Stop when `ship=true` and no high test issue is open, or after `MAX_ROUNDS=3`.
  **Added during the build:** a red gate that the Reviewer neither flags as a high test issue nor explains as a `site-issue` becomes a synthetic high issue ("the gate is red"), so a reviewer saying `ship=true` over failing tests can't end the loop.
  **Added after dry run 2 (re-review scope):** from round 2 on, the Reviewer first checks each previously blocking issue (still unfixed = still high). A *new* high counts only if the fixes introduced it, or it shows a refined-spec or original step that the current code doesn't meet; anything it could have reported earlier is downgraded to medium (a follow-up). This makes the loop converge instead of finding fresh highs every round.
  **Added after dry run 2 (`needs-human` status):** if the final gate is green but the round budget ran out with high issues open, or the Reviewer says `ship=false` without a concrete high issue, the case stops as **`needs-human`**, not `failed`. `report.md` then shows a "Your call" block: rerun with `MAX_ROUNDS+1`, or squash-merge the case branch by hand (Acceptance didn't run, so check it against the original yourself). A red gate is still `failed`.
- **Contract:** Codex gets `--output-schema` (OpenAI's strict subset: `additionalProperties: false`, every property required, no `$schema`/`$id`/`title`, so the orchestrator writes a stripped copy). The Claude fallback and Acceptance use `claude -p --json-schema`, whose result arrives in `structured_output`. Both are validated again with `ajv`.

### ⑤ Acceptance (the Analyst again, as the final judge)
**Job:** answer one question: *does the code fulfil the ORIGINAL requirement as written?*

- **Input:** the original case text, the final test code, the gate results, this case's **`README.md` "Requirement deviations"** (and, after a CI round, **"CI limitations"**) subsections, and any open reviewer `spec-gap` issues. **Not** the refined spec. That's the point: it catches drift that happened *during refinement* (e.g. the analyst softened "validate the number on the cart symbol" into "cart is not empty"). The only allowed differences from the original are the ones written in the README with a reason.
- **Deviation check (brief, one paragraph per deviation):** for each README entry for this case, it answers:
  1. Is the original step really unfulfillable? It may re-check the evidence once, with a single read-only look at the page or API.
  2. Is the amendment the smallest change that keeps the original intent?
  3. Does the code implement the amended version, and nothing weaker?

  If any answer is no, the result is REJECT with the reason. A difference between code and original that is **not** in the README is always a REJECT: an undocumented deviation is drift.
- Run it as a **fresh session**, not a resume of the analyst, so its earlier decisions don't bias it.
- **Output:** a traceability table + verdict:

| Original step | Covered by | Assertion | Deviation | OK? |
|---|---|---|---|---|
| 1.6 Validate the number on the cart symbol | `case-1.spec.ts › purchase` | `expect(cartBadge).toHaveText('2')` | — | ✅ |
| 2.6 Footer contains 2023 and ToS | `case-2.spec.ts › footer` | current year + `Terms of Service` | README D-2.6: site shows 2026; reason checked | ✅ |

`ACCEPT` → publish and merge (⑥–⑧). `REJECT` with reasons → one coder round with the rejection notes → gate → **one Reviewer round** (changed code is never merged unreviewed) → a second Acceptance. Still rejected → the case is marked **failed** in the report, and the pipeline continues with the next case (cases are independent once Case 0 is done).

### ⑥ Publish + merge (code, in the orchestrator): one PR per case, merged when every gate is green

**Two modes:**

| Command | What leaves your machine | Use it for |
|---|---|---|
| `orchestrator.ts` | nothing | developing and trying out the pipeline; rerun as often as you like |
| `orchestrator.ts --merge` | branches, PRs, and **merges into `main`** when all four gates are green | the real run |

There's no "push but don't merge" mode, because the merge rule below already provides that safety. A case that fails any gate, including a broken CI workflow, stays an open draft PR, which is exactly what such a mode would have shown.

**Sequential: each case branches from the freshly merged `main`.** The cases run one after another anyway, so there's no need for stacked branches:

```
main ─●─────────●──────────●──────────●── …
       \       / \        / \        /
        case-0 ─   case-1 ─   case-2 ─
        PR → main  PR → main  PR → main
```

1. Branch `ai/<stamp>/case-N-<slug>` from the current `main` (`git fetch` first, so it includes the case merged a minute ago).
2. Analyst → Coder → Gate → Reviewer loop → Acceptance, as above.
3. Commit `Case N: <title>`, with the acceptance table in the commit body. Push and open a PR to `main`. The PR description holds that case's slice of `report.md`: spec summary, review rounds, acceptance table, README deviations and CI limitations (updated if a CI round adds one), and any site issues.
4. Wait for CI (section 13).
5. **Merge rule: all four green, or no merge:**
   - Reviewer `ship=true` with no high issue open,
   - local gate green (including `--repeat-each` and the README/spec deviation check),
   - Acceptance `ACCEPT`,
   - CI green **for this case**, in **every matrix job** (Node 18 and 20): every test of this case passed (or was skipped under the three conditions in section 4c), **and** no test that was green in `main`'s latest completed CI run (push or nightly) is now red.
     Tests of earlier, already merged cases that fail in CI **and also fail on `main`'s latest run** are site drift, not caused by this case. They're reported, but they don't block this merge. Otherwise one flaky or changed site would block every later case.
     **No baseline yet** (Case 0, and Case 1 if `main` has no completed run): the "no new red" part is skipped, and only this case's own tests count.

   Then `gh pr merge --squash --delete-branch`. The orchestrator checks the four conditions itself and then merges. It does **not** use GitHub's auto-merge feature, so nothing can merge if the orchestrator crashes halfway.
6. **Any gate red** → the PR stays open as a **draft** with the reasons, the case is marked failed in the report, and the next case branches from `main` *without* it. Cases 1–5 are independent, so one failure doesn't block the others.
7. **Exception: Case 0.** If the skeleton isn't merged, nothing after it can work, so the run stops.

**Local mode mirrors this.** Without `--merge`, the orchestrator merges accepted cases into a local branch `ai/<stamp>/integration` instead of `origin/main`, and the next case branches from that. So a local run follows exactly the same path as a real one, minus GitHub (and minus the CI gate, which only exists on GitHub).

**The trade-off:** agent code lands in `main` without you reading it first. That's acceptable here because there are four independent gates, every change is a squashed PR you can review afterwards and `git revert`, and every requirement change is in the README. For a real team I'd keep a human approval before merging.

- `README.md` (how to run, case list, **Requirement deviations**, **CI limitations**) is written by the **orchestrator itself** from `pipeline/readme-template.md` on the Case 0 branch, **before** Case 0's Analyst runs. Otherwise the first Analyst would have no README to write into. It has **one empty subsection per case, including Case 0 and X1**; the Case 0 Coder fills in only "how to run":

  ```markdown
  ## Requirement deviations
  ### Case 0 (preconditions + X1 CI)
  _None._
  ### Case 1
  _None._
  …

  ## CI limitations
  ### Case 0 (preconditions + X1 CI)
  _None._
  ### Case 1
  _None._
  …
  ```
  Each case edits only its own subsections; the orchestrator checks that a case's diff to `README.md` stays inside them. With sequential merges conflicts can't happen anyway, but this also stops one case from rewriting another case's entries.

---

## 4. Handoff contracts (summary)

| From → To | Artifact | Validated by orchestrator |
|---|---|---|
| Orchestrator → Analyst | original case text | — |
| Analyst → Coder | `specs/case-N.json` | JSON schema; every original step has ≥ 1 refined step; `status` |
| Analyst → README | deviation entries in its own case subsection | every `deviations[]` item in the spec has a README entry with all five fields (original, amended, why unfulfillable, why this amendment, evidence), and vice versa; evidence file exists in `docs/evidence/` |
| Coder → README | CI-LIMIT entry (only after a CI-only failure) | ID, site, symptom, handling, evidence; evidence file exists |
| Coder → Gate | commit | `STATUS:` line; changed files inside the allowed paths |
| Gate → Reviewer | test JSON + per-test diff | — (generated by code) |
| Reviewer → Coder | `review.json` | JSON schema (no markdown fences!) |
| Coder + Gate → Acceptance | final code + results | — |
| Acceptance → Publish/Merge | `acceptance.json` | schema; every original step has a row |
| CI → Merge | CI test report (JSON artifact) | every skipped test has a README CI-LIMIT entry, a matching reason, and a local pass (section 4c) |

Every agent prompt includes the **UNATTENDED** block (never ask; decide and state; end with `STATUS: DONE | BLOCKED <reason>`; failing tests that expose a real mismatch are DONE, not BLOCKED) and the **ORACLE** rule (assert the documented requirement, never the site's current output).
**Changed during the build:** the `STATUS:` line applies to the Analyst and Coder only. The Reviewer and Acceptance answer with a JSON object (schema-enforced), and a trailing status line would break it, so they get just "never ask questions". All prompts also get an **ISOLATION** block (only read inside the working directory; don't read `PLAN.md` or `pipeline/`). The blocks live in `pipeline/prompts/shared.md`.
The Analyst gets **one repair attempt** (resumed session) when its spec breaks the contract (schema, step coverage, path guard, deviation check); a second failure fails the case.

## 4b. Requirement deviations (Analyst may amend, README records, Acceptance validates)

The oracle rule says: assert the requirement, not the site. But some requirements **can't be fulfilled as written** on a live site we don't own. Then a test that always fails is useless, so the Analyst is allowed to amend the requirement, under these rules:

**When it's allowed.** Only when the step is *unfulfillable*: the value, element or behaviour the requirement names does not exist on the live site or API, and the Analyst has checked that with evidence. Examples: the footer says 2026, not 2023; a link or menu item was renamed or removed.

**When it's not allowed.**
- To make a step easier, or to fix a flaky test.
- When the step is *possible but hard* (ads, iframes, slow users): that's the Coder's problem.
- To drop a step entirely. Every original step stays, in amended form if needed.
- When the site *behaves wrongly* against a requirement that is plainly still meant (e.g. the cart badge shows the wrong count). That's a real failure: the test asserts the requirement and fails, and it is reported.
  **Consequence:** such a case can't pass the gate or CI, so it is **never merged automatically**. It stays a draft PR, with the site issue at the top of the description. You decide: for example, mark the test as an expected failure with `test.fail()` and a README note, then merge by hand.

**How.** The amendment is the *smallest change that keeps the intent*, and it's derived at runtime where possible (`new Date().getFullYear()`, not a hard-coded 2026, so the test doesn't break in January). The Analyst writes it in two places:
1. `specs/case-N.json` → `deviations[]` (for the Coder and the gate),
2. `README.md` → its own case subsection under **Requirement deviations** (for humans and for Acceptance):

```markdown
### Case 2
**D-2.6: Footer year**
- **Original:** Validate the footer message contains 2023 and Terms of Service.
- **Amended:** Validate the footer contains the current year and Terms of Service.
- **Why the original can't be fulfilled:** the live footer reads "© 2026 Sauce Labs. All Rights Reserved." (checked 2026-11-25); 2023 is not on the page.
- **Why this amendment:** keeps the intent (copyright year + ToS link are shown) with the smallest change; the year is computed at runtime.
- **Evidence:** [`docs/evidence/case-2/footer.png`](docs/evidence/case-2/footer.png)
```

**Evidence is committed**, in `docs/evidence/case-N/` inside the worktree, so the README links work on GitHub and survive `cleanup.ts --purge-logs`. It's kept small: a cropped screenshot or the observed text. `runs/<stamp>/` (gitignored) holds only logs.

**Who checks it.**
- The **gate** checks that the spec and the README agree, entry for entry, and that the evidence file exists.
- The **Reviewer** checks that the code implements the amended step and nothing weaker.
- **Acceptance** reads the README entry next to the original requirement and briefly validates the reason (section 3 ⑤). An unconvincing reason, or a code-vs-original difference with no README entry, is a REJECT.
- The **PR description** for that case repeats the deviation, so you see it before merging.

## 4c. CI limitations (sites that block CI runners)

A requirement deviation means *the site can't do what the requirement says*. A CI limitation is different: *the site works, but refuses GitHub's runners*. The typical cause is bot protection such as Cloudflare, which challenges data-centre IPs. The test is fine and passes locally; CI just can't reach the real page. The manual solution hit exactly this. Agents are **not** told which site; they must find it from the CI evidence.

**What's not allowed:** getting around the protection (stealth plugins, faked browser fingerprints, solving challenges). Bot detection is the site owner's decision, and a test suite must not defeat it. A blanket `test.skip(!!process.env.CI)` isn't allowed either. It would never run the test in CI, even on days the site lets the runner through, and it would hide real failures.

**What is allowed: skip at runtime when the block is detected.**
- The test runs in CI as normal. Right after the navigation that can be blocked, it checks whether the page is the bot-protection challenge, using an exact signature such as the page title "Attention Required! | Cloudflare" or "Just a moment…", or the challenge-specific elements.
- Block page detected → `test.skip(true, 'CI-LIMIT-4: blocked by bot protection, see README')`. Otherwise it continues and can fail for real.
- The detection is a shared helper (`utils/botProtection.ts`), so every case uses the same signature list and the Reviewer reviews it once. It must match the challenge page exactly: "the page looks different" is never a reason to skip.

**A skip in CI counts as green only if all three hold** (checked by the orchestrator before merging; it applies to the **current case's tests**, because tests of earlier merged cases are judged by the "no new red" rule in section 3 ⑥):
1. **The local gate ran that test and it passed** in the same case run. Locally there's no block, so the test really was exercised.
2. **`README.md` → CI limitations** has an entry for it with an ID (`CI-LIMIT-4`), the site, the symptom, the evidence (block-page screenshot committed to `docs/evidence/case-N/`, plus the CI run link) and a note that it runs locally.
3. **The skip reason in the CI test report** starts with that ID.

If any one fails, the skipped test counts as a failed test, so an agent can't turn CI green by skipping.

```markdown
## CI limitations
### Case 4
**CI-LIMIT-4: guru99 blocks GitHub Actions runners**
- **Symptom:** the new tab shows the Cloudflare challenge ("Attention Required! | Cloudflare") instead of the page.
- **Handling:** the test skips at runtime only when that page is detected; on other days it runs in full.
- **Evidence:** CI run <link>; block-page screenshot [`docs/evidence/case-4/ci-block.png`](docs/evidence/case-4/ci-block.png) taken from the CI artifact.
- **Still verified:** the test passes in the local gate on every pipeline run.
```

**How the agents get there.** `CONVENTIONS.md` contains the general rule above, without naming any site. The block can't be seen locally, so it shows up on the first CI run. The orchestrator handles a **test that fails only in CI** (green locally, red in CI) like this:
1. It downloads the CI artifacts: the failure message, the error-context page snapshot and the trace.
2. **One automated round:** the Coder (resumed) gets that evidence plus the rule. Either it shows that the failure is a bot-protection block and adds the runtime detection plus the README entry, or it answers `STATUS: BLOCKED` ("not a block page").
3. The local gate, Reviewer and Acceptance run again. Acceptance validates the CI limitation like a deviation: is the evidence really a challenge page, is the detection exact, and is the test still asserting everything?
4. CI runs again, and the merge rule applies as usual.

Anything else that fails only in CI (timing, viewport, missing fonts, regional content) stays a **draft PR for you**, as before. One round only, and only for this cause.

**Visibility.** The CI job summary gets a "Skipped in CI" table with the test, the CI-LIMIT ID and the reason. `report.md` has a matching column. The nightly run shows over time whether the block is constant or intermittent.

---

## 5. Known traps the agents must discover (our test of the pipeline)

These are things I'd expect from the requirements and the sites. Don't put them in the prompts. They're how we judge whether the **Analyst** really explores, and whether **Acceptance** catches drift.

| Case | Trap | Expected handling |
|---|---|---|
| 0 | Playwright must be exactly `1.39.0`, and the browsers must match that version | Pin without `^`; `npx playwright install` |
| 0 | Playwright 1.39 likely predates Ubuntu 24.04 (`ubuntu-latest`), so `install --with-deps` can fail on renamed system packages | Pin the runner to `ubuntu-22.04` |
| 1 | `/inventory.html` redirects to login when logged out | Spec notes the redirect |
| 1 | `performance_glitch_user` is deliberately slow | Proper waiting, no hard sleeps; gate's repeat-each catches flakiness |
| 1 | Folder is `test/resources` (singular), while tests usually live in `tests/` | Follow the requirement literally; note it |
| 1 | Checkout needs first name / last name / zip, which the requirement doesn't give | Analyst decides test data |
| 2 | Footer year is probably no longer `2023` | Analyst must *discover* it, amend the step to the current year (computed at runtime) and write a README deviation entry (section 4b). Acceptance validates the reason |
| 3 | The editor is a third-party rich-text widget (possibly inside an iframe); bold/underline via toolbar or shortcuts | Verify formatting through the DOM (`<strong>`/`<u>` or equivalent), not just text |
| 4 | guru99: cookie consent, ads, ad iframes, `http://` | Handle consent; locate the *right* iframe; new-tab handling via `context.waitForEvent('page')` |
| 4 | "Selenium" link appears only on hover | Hover, then click |
| 4 | guru99 is behind Cloudflare, which blocks GitHub runners (seen in the manual solution) | Invisible locally. Must be found from CI evidence and handled with a runtime-detected skip + README CI-LIMIT entry (section 4c), not a blanket skip |
| 5 | "Add Rest Api library": Playwright's built-in `request` vs. an extra library like `axios` | Decision recorded in the spec; literal reading suggests adding a library |
| 5 | Log format `Name \| email` | Assert the format, not just that something was logged |

---

## 6. Isolation and safety

- **A fresh git worktree per run**, so a bad run can be thrown away without touching your checkout. Everything a run creates carries its `<stamp>`, so it's easy to find and never collides with another run:
  ```
  ../Gsys_hw_TA_agentic-run-<stamp>/   ← one worktree for the whole run
     ai/<stamp>/integration            ← local mode: accepted cases are merged here
     ai/<stamp>/case-0-setup           ← one branch per case, created one after another
     ai/<stamp>/case-1-purchase …         (from main, or from integration in local mode)
  runs/<stamp>/                        ← logs, manifest.json, report.md (in your checkout, gitignored)
  ```
- **Clean agent environment:** `--setting-sources project --settings '{"disableAllHooks": true, "permissions": {"deny": […]}}' --strict-mcp-config --disable-slash-commands`, so your global plugins, hooks **and user-level allow rules** don't leak in (`--setting-sources project` was added during the build: without it a broad allow rule in your own `~/.claude/settings.json` would widen every agent's permissions).
- **The run's worktree sits next to the main checkout**, even when the orchestrator runs from a Claude worktree under `.claude/worktrees/`: the path is derived from `git rev-parse --git-common-dir`.
- **Local mode branches from the checkout's `HEAD`** (or `--base <ref>`), not from `main`, until the pipeline itself is merged into `main`. The only MCP server allowed is Playwright MCP, and only for the Analyst (`--mcp-config analyst-mcp.json`).
- **Least privilege per role:**

| Role | Edit files | Shell | Browser | Network |
|---|---|---|---|---|
| Analyst | `specs/`, `docs/evidence/case-N/`, its case subsection of README "Requirement deviations" | `curl`, scratch scripts | ✅ | ✅ |
| Coder | code paths from ② + its case subsection of README "CI limitations" (+ `docs/evidence/case-N/` for CI evidence) | `npx playwright test`, `npx tsc` | via tests | via tests |
| Reviewer | ❌ (read-only sandbox) | read-only, may run `node -e` | ❌ | ❌ |
| Acceptance | ❌ | ❌ | read-only, only to re-check a deviation's evidence | read-only, same purpose |

The orchestrator enforces the README parts: a case's diff to `README.md` may only touch its own subsections, and only the section that role owns.

- **Cleanup lists before it deletes** (`pipeline/cleanup.ts`, below). No wildcard `branch -D ai/*` (the lesson from 2026-11-20).

### Removing a run: `cleanup.ts <stamp>`

When a run is kept and when it's removed:
- **Run fails:** the orchestrator **keeps** the worktree for inspection and prints the exact cleanup command at the end, as `swarm.ts` did.
- **Run succeeds:** it removes the worktree itself, keeping `runs/<stamp>/`.

What a run leaves behind depends on the mode:

| Mode | Leaves behind | `cleanup.ts <stamp>` removes |
|---|---|---|
| local | worktree, local `ai/<stamp>/*` branches | all of it. The run is fully gone, as if it never happened |
| `--merge` | the above, plus remote branches, **draft PRs** for failed cases, and **merged commits on `main`** | the worktree, local and remote branches of **unmerged** cases, and closes their draft PRs |

**Rules:**
1. **List first, then delete.** It prints every item with its exact name: worktree path, each local branch, each remote branch, each PR number and title. Then it asks `Delete these N items? [y/N]`. `--yes` skips the question, `--dry-run` only lists.
2. **Exact names, not patterns.** The list comes from the run's own manifest (`runs/<stamp>/manifest.json`, written by the orchestrator as it creates each branch, PR and commit), and it's checked against what actually exists. No `ai/*` globbing, so it can't touch another run.
3. **Never touches `main` or merged work.** Merged cases passed all four gates. Taking them back is a deliberate decision, so cleanup only **prints** the `git revert <sha>` command for each merged case commit (newest first) and leaves running them to you.
4. **Logs stay.** `runs/<stamp>/` is kept unless you pass `--purge-logs`, because a failed run's logs are what you learn from.
5. **Idempotent.** Running it twice, or after a half-finished cleanup, only removes what is still there. It also runs `git worktree prune` for a worktree folder that was deleted by hand.

Example output:
```
Run 2026-11-26T09-14-03 (mode: --merge)
  worktree      ../Gsys_hw_TA_agentic-run-2026-11-26T09-14-03
  local branch  ai/2026-11-26T09-14-03/integration
  local branch  ai/2026-11-26T09-14-03/case-3-editor
  remote branch origin/ai/2026-11-26T09-14-03/case-3-editor
  draft PR      #14 "Case 3: Rich Text Editor" (REJECTED: bold not verified in DOM)
Merged on main (NOT touched; to undo, run yourself):
  git revert 9f2c1ab   # Case 5: REST API testing
  git revert 41d7e0c   # Case 4: iFrame and tab handling
Delete these 5 items? [y/N]
```

---

## 7. Budgets and observability

- Per agent: `--max-turns`, wall-clock timeout; per run: `MAX_ROUNDS=3`, one acceptance retry per case. No cost cap: the agents run on your Claude/Codex subscription, not API tokens.
- **You can stop a run at any time with Ctrl+C.** The orchestrator catches the interrupt, stops the running agent, and still writes `report.md` and `manifest.json` (case in progress marked `interrupted`), so `cleanup.ts <stamp>` works on a stopped run too.
- Everything is logged to `runs/<stamp>/case-N/`: prompts, agent outputs, `spec.json`, `review-roundK.json`, test JSON, `acceptance.json`, the diff of every handoff.
- `runs/<stamp>/report.md`, always written (also on failure):

```
Case | Analyst | Coder | Gate  | Review       | Acceptance | CI          | Skipped in CI | Merged | Deviations
0    | DONE    | DONE  | ✓     | ship (1 rnd) | ACCEPT     | ✓           | —             | ✓      | —
2    | DONE    | DONE  | ✓     | ship (2 rnd) | ACCEPT     | ✓           | —             | ✓      | D-2.6 footer year
4    | DONE    | DONE  | ✓     | ship (1 rnd) | ACCEPT     | ✓ (1 round) | CI-LIMIT-4    | ✓      | —
…
Time: mm:ss  Turns: …  Flaky: …  Local-green/CI-red: …  Site drift on main: …  Contaminated: no
```

---

## 8. Models ("local")

Everything runs on this machine through the CLIs, same as Step 7:

| Role | Default | Why |
|---|---|---|
| Analyst / Acceptance | `claude -p` (Opus) | needs exploration + judgment |
| Coder | `claude -p` (Sonnet or Opus) | code quality |
| Reviewer | `codex exec` | different model = better critic |
| Optional experiment | Ollama (e.g. `qwen3:8b`) as Analyst or Reviewer | to see where a small local model breaks. Expect a weaker reviewer and false confidence |

Fully offline models are an experiment, not the default: the Step 4–5 labs showed small models miss things and need a stronger judge.

---

## 9. Evaluating the pipeline itself

The interesting output isn't only the tests. It's *how well the agentic workflow did* compared to you:

1. **Correctness:** all 5 cases ACCEPTed? Run the final suite 5× (`--repeat-each=5`) for a flakiness rate.
2. **Requirement fidelity:** compare the acceptance tables with your own reading of the PDF. Did any refinement drift slip through?
3. **Deviation quality:** did the Analyst find the footer year (and any others from section 5) and document them in the README? Were any deviations *unjustified*, meaning used to dodge a hard step, and did Acceptance catch them?
4. **CI limitation handling:** did the Coder recognise the Cloudflare block from the CI evidence and use an exact runtime detection, or did it reach for a blanket skip or an overly broad "page looks wrong" check?
5. **Diff against the manual solution** (`../Gsys_hw_TA`): structure, locator strategy, waits, what each one missed.
6. **Time** (wall clock and agent turns) vs. your manual effort.
7. **Pipeline failures:** every time the orchestrator had to stop (contract break, BLOCKED, budget), note it. Those are the multi-agent lessons for the interview stories.

---

## 10. Repository layout

```
Gsys_hw_TA_agentic/
├── PLAN.md                     ← this file
├── requirements/homework.md    ← PDF transcribed, read-only for agents
├── pipeline/                   ← its OWN npm package (ajv, tsx): the root package.json belongs to the homework
│   ├── package.json            ← run with `npm --prefix pipeline run orchestrate -- --cases 0,5`
│   ├── orchestrator.ts         ← the loop, gates, contracts, report
│   ├── agents.ts               ← claude()/codex() wrappers (from swarm.ts)
│   ├── cleanup.ts              ← removes one run by its manifest (section 6)
│   ├── prompts/                ← analyst.md, coder.md, reviewer.md, acceptance.md, shared.md
│   ├── schemas/                ← spec.schema.json, review.schema.json, acceptance.schema.json
│   ├── readme-template.md      ← README skeleton the orchestrator writes before Case 0
│   └── analyst-mcp.json        ← Playwright MCP config, Analyst only, limited to the case sites' origins
├── CONVENTIONS.md              ← coding rules shared by coder + reviewer
├── runs/                       ← logs + manifest.json per run (gitignored)
└── (generated by agents, one case branch at a time)
    ├── package.json, playwright.config.ts, tsconfig.json    ← Case 0
    ├── .github/workflows/playwright.yml                     ← Case 0 (section 13)
    ├── README.md  (Requirement deviations + CI limitations)  ← skeleton by the orchestrator, each case fills its subsections
    ├── specs/case-N.{md,json}
    ├── pages/, tests/, utils/ (incl. botProtection.ts)
    ├── test/resources/credential.json
    └── docs/evidence/case-N/   ← committed evidence for README entries
```

`main` starts with the pipeline only. Each case branch adds one case on top, so after a `--merge` run `main` holds the pipeline plus the solution it produced, one squashed commit per case.

---

## 11. Build order

1. **Transcribe** the PDF into `requirements/homework.md` with stable case and step IDs.
2. **Port** `agents.ts` from `swarm.ts`: `claude()` with JSON output, `checkStatus()`, `runTests()` with per-test status, `commit()`, report writer.
3. **Prompts + schemas** for the 4 roles; a JSON-schema validator (`ajv`) in the orchestrator.
4. **Dry run on Case 0 + Case 5 only** (no Analyst browser yet; Case 5's Analyst only needs `curl`, the simplest setup): proves the loop, the contracts and the gate.
5. **Add the Analyst browser** (Playwright MCP), run Case 1–2.
6. **Run Case 3–4** (the hardest sites).
7. **Publish + merge step** behind `--merge`, plus the CI wait (section 13). Order:
   - full local runs until the report looks right,
   - `--merge` with Case 0 alone: a green smoke test in Actions proves the workflow, and the merge proves the gate logic,
   - `--merge` full run.
8. **Evaluate** (section 9) and write up the lessons.

---

## 12. Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| 1 | Orchestrator as code or as an LLM agent? | **TypeScript script** (section 1) | ✅ decided |
| 2 | One PR for the whole run, or one PR per case? | **One PR per case**, each branched from the freshly merged `main` (section 3 ⑥) | ✅ decided |
| 3 | Push and merge automatically? | **Local by default; `--merge` pushes, opens a PR and squash-merges to `main` when Reviewer, gate, Acceptance and CI are all green.** No separate `--publish` mode | ✅ decided |
| 4 | Case 2 footer: assert `2023` or the current year? | **Current year**, derived at runtime, as a README deviation (section 4b) | ✅ decided |
| 5 | May the Analyst change a requirement? | **Yes, only if it's unfulfillable as written**: smallest change, reasoning + evidence in `README.md`; Acceptance reads it and briefly validates the reason (section 4b) | ✅ decided |
| 6 | Case 5: Playwright `request` or `axios`? | **Analyst decides** and records it; Acceptance checks the "add a library" wording. Dry run 3: the Analyst chose the built-in `request` (APIRequestContext), Acceptance agreed, and **Adam confirmed it (2026-11-26)** | ✅ decided |
| 7 | Run the tests in CI? | **Yes: GitHub Actions on every PR** (section 13) | ✅ decided |
| 8 | A site blocks CI runners (Cloudflare on guru99)? | **Runtime skip only when the block page is detected; counts as green only with a local pass + README "CI limitations" entry + matching reason** (section 4c). No blanket CI skip, no getting around the protection | ✅ decided |
| 9 | Reviewer: Codex or Claude? | Codex (different model) | default, not yet confirmed |
| 10 | Try a local Ollama model in one role? | Yes, as a second run after the baseline works | default, not yet confirmed |
| 11 | Should a red CI make the pipeline fix the code? | Only for a suspected bot-protection block: one Coder round with the CI evidence (section 4c). Anything else means no merge, a draft PR, and you decide | default, not yet confirmed |
| 12 | Nightly scheduled run to detect site changes? | Yes, on `main`. Together with push runs, it keeps `main`'s latest CI result fresh, which is the baseline for the "site drift" rule in section 3 ⑥ | default, not yet confirmed |

---

## 13. CI: GitHub Actions

The local gate proves the tests pass **on your Mac, with your browsers, through your network**. CI proves they pass on a clean Linux machine from `package.json` alone. That's what a reviewer of the homework will see, and it catches "works on my machine" problems: missing dependencies, macOS-only paths, timing differences, and sites that behave differently for a US data-centre IP (cookie banners and ads on guru99 may differ or vanish).

### Who writes it
The **Coder in Case 0**, from requirement X1, like any other code. The Reviewer reviews it, the gate runs `actionlint`, and Acceptance checks it against X1. It's a good test of the pipeline too: will the agents pin versions, use least-privilege permissions, and upload reports? The checklist below goes into `CONVENTIONS.md` so the reviewer has something concrete to check.
**Kept out of `CONVENTIONS.md` on purpose:** the `ubuntu-22.04` runner pin from the sketch. It is a section 5 trap, so the agents have to find it themselves.
**`actionlint` isn't installed on this machine yet** (`brew install actionlint`). Until it is, the gate logs "workflow lint SKIPPED" as a warning instead of failing.

### What the workflow must do (checklist, not code)
- **Triggers:** `pull_request` to `main` (every case PR), `push` to `main` (re-checks the merged result), `workflow_dispatch`.
- **Least privilege:** `permissions: contents: read`. No secrets needed: the credentials are public demo values and `credential.json` is committed, as the homework asks.
- **Concurrency:** one group per PR, cancelling in-progress runs **only for PRs**. Push and nightly runs on `main` are never cancelled **or replaced**, because the merge rule uses them as its baseline. **Corrected after dry run 2** (Codex found it): a concurrency group holds only *one pending* run, so the original per-branch group (`github.ref`) would let a third push to `main` silently drop the queued second push run, even with `cancel-in-progress: false`. Non-PR runs therefore get a unique group (`github.run_id`).
- **Node:** matrix over `18` (the homework's minimum) and `20`, via `actions/setup-node` with npm cache.
- **Install:** `npm ci`, then `npx playwright install --with-deps` using the **1.39.0** version from the lockfile. Don't use `@latest`, or the browsers won't match the pinned Playwright.
- **Run:** the `npm test` script required by the preconditions, so CI also verifies that the runner script works.
- **Config (`playwright.config.ts`, based on `process.env.CI`):** `forbidOnly: true`, `retries: 1`, `trace: 'on-first-retry'`, reporters `github` (annotations on the PR diff) + `html` + `json` (to `test-results/results.json`, which the orchestrator reads for per-test status and skip reasons).
- **Artifacts:** upload `playwright-report/` and `test-results/` (including `results.json`) with `if: ${{ !cancelled() }}`, so traces and the JSON report exist when it fails.
- **Flaky tests are visible:** a test that passed only on retry is listed in the job summary (`$GITHUB_STEP_SUMMARY`). CI retries once so one network hiccup doesn't block a PR, but flakiness is reported, never hidden.
- **Skipped tests are visible:** a "Skipped in CI" table in the job summary with the CI-LIMIT ID and reason (section 4c).
- **Timeouts:** `timeout-minutes` on the job, so a hanging external site can't eat runner minutes.
- **Action versions pinned** to a major tag (`actions/checkout@v4` and so on), not `@main`.

A sketch, to show the shape (the Coder writes the real one):

```yaml
name: Playwright tests
on:
  pull_request: { branches: [main] }
  push: { branches: [main] }
  workflow_dispatch:
  schedule: [{ cron: "0 5 * * *" }]   # nightly site-drift check (decision 12)
permissions: { contents: read }
concurrency:
  group: "${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}"  # PRs share a group; other runs never queue behind each other
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}   # never cancel main's baseline runs
jobs:
  test:
    runs-on: ubuntu-22.04              # Playwright 1.39 likely predates 24.04 support
    timeout-minutes: 20
    strategy: { fail-fast: false, matrix: { node: [18, 20] } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node }}", cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: "playwright-node${{ matrix.node }}"
          path: |
            playwright-report/
            test-results/
          retention-days: 14
```

### Case 0 needs something to run
A PR with zero tests makes `playwright test` fail with "no tests found". Case 0 therefore includes one **smoke test** (for example: the saucedemo login page loads). This also proves the workflow before any real case lands.
**The smoke test opens a real page; it does not test the setup.** Steps 0.1–0.3 and X1 are verified by the gate (pin check, `npm test` script check, `tsc`, `actionlint`) and by the CI run itself, not by Playwright tests that parse `package.json` or workflow YAML (lesson from dry run 2, section 14).

### How CI feeds back into the pipeline
With `--merge`, after each case PR is opened:
1. The orchestrator waits for the checks: `gh pr checks <pr> --watch`, with a timeout of **25 minutes**, longer than the job's own 20-minute `timeout-minutes`. A wait that times out counts as red. It runs in the orchestrator's code, not in an agent.
2. **Green** (judged per matrix job, using the rule in section 3 ⑥) → recorded in `report.md` and the PR description. This is the last of the four merge conditions.
3. **Green with skips** → the skip conditions from section 4c are checked. Any unmet condition counts as red.
4. **Red** → **no merge**, with one exception: a test that passed locally but fails only in CI gets **one** automated round to check for a bot-protection block (section 4c). Anything else, and anything still red after that round, means the PR is set to **draft**, and the failing test names plus the artifact link go into the report. Other CI-only failures are usually environment differences (region, timing, headless Linux) that need a human to look at the trace first (decision 11).
5. **Local green but CI red** is its own column in the report. It's the most interesting signal for the evaluation (section 9).

### Nightly run (decision 12)
The tests hit **live third-party sites** that change without notice: the footer year is the proof. A scheduled nightly run on `main` turns that into a signal ("guru99 changed its menu") instead of a surprise when someone opens the repo. It runs only after the PRs are merged. Together with the push runs, it keeps `main`'s latest CI result fresh. That result is the baseline for the merge rule's "site drift" exception (section 3 ⑥): a test that is already red on `main` doesn't block a new case.

### What CI deliberately does *not* do
- It doesn't run the agents. The agentic pipeline stays local (it needs your Claude/Codex logins); CI only runs the resulting tests.
- It doesn't merge anything. Merging is done by the orchestrator, which has all four gate results; CI knows only one of them.

---

## 14. Dry-run log (build step 4: Case 0 + 5, local mode)

The plan was written before any code ran. These are the things the dry runs proved wrong or missing. The fixes are already folded into the sections above; this is the record of *why*.

### Run 1 (`2026-11-25T21-10-25`): stopped by hand during the first review
- **Playwright 1.39.0's Chromium (build 1084, Chromium 119) crashes at launch on macOS 26** (`SEGV_ACCERR`, headless and headed). Firefox 118 and WebKit 17.4 from the same version work. The Coder found it, refused to weaken the test, and reported it, which was the right behaviour. No fix round could solve it, so the run was stopped.
  **Decision (Adam):** keep `1.39.0`; it is fulfillable (Firefox/WebKit locally, all browsers on `ubuntu-22.04`), so it is *not* a requirement deviation. The pipeline now gives every agent an **Environment facts** block (`prompts/shared.md`) with the measured browser behaviour and lets the agents choose the browser and record why. In run 2 the Analyst chose Firefox for local and CI.
- **Ctrl+C wrote no report.** `tsx`/`npm` forward the terminal's SIGINT, so one Ctrl+C arrived 2–3 times and hit the "second Ctrl+C = exit now" path. Fixed: repeats within 2 s are ignored.
- Turn budgets were too tight (Coder used 79 of 80). The Analyst lost turns to permission denials for `node -v` and compound shell commands.

### Run 2 (`2026-11-25T21-34-20`): Case 0 failed after 3 review rounds, Case 5 not run
- Analyst, Coder and gate all worked (gate GREEN every round, 16 min total). The contracts, ajv validation, path guard, README skeleton, report and manifest all behaved as designed; `cleanup.ts` removed run 1 by its manifest.
- **Failure: a reviewer arms race on X1.** The Analyst decided that X1 ("tests run in CI") should be asserted by the smoke test, which regex-checked the workflow YAML. Codex (correctly, in a narrow sense) proved each round, by mutating the YAML in memory, that the test missed yet another bad edit (`if: false`, `paths:` filters, a removed install step). Each fix produced 2–4 new "high" issues; the round budget ran out. This is Step 7's "critic is never happy" again, in a new form.
  **Root cause in the plan:** it never said *how* setup/CI requirements are verified, so the Analyst invented "a test that parses config". **Fix:** 0.x and X1 are verified by the gate (pin, `npm test` script, `tsc`, `actionlint`) and by the CI run; no Playwright tests that parse `package.json` or YAML (`CONVENTIONS.md`, Analyst Case 0 note, section 13). Reviewer prompt: a high issue is a defect *in the current files*; "a future edit wouldn't be caught" is not one, and it must not mutate files to hunt for missing checks.
- **Two more loop fixes** (made from the parent session at Adam's request, section 3 ④): a scoped re-review, so later rounds check the old highs instead of inventing new ones, and a `needs-human` case status for "gate green, reviewer still unconvinced", so the decision goes to a human instead of failing the case.
- **One real finding adopted:** the concurrency group from section 13 could drop a queued push run on `main` (see section 13, Concurrency).
- **Codex on a free ChatGPT plan** kept up for 3 reviews (about 35 s each). The orchestrator now falls back to a Claude reviewer if Codex fails, and records that in the report.

### Run 3 (`2026-11-26T04-05-03`): both cases ACCEPTED and merged into the local integration branch
- 25 min wall clock, 172 agent turns, 0 flaky, not contaminated. Each case: Analyst → Coder → gate GREEN → Codex `ship=false` (1–2 concrete high issues) → one fix round → Codex `ship=true` with 0 issues → full-suite gate GREEN → Acceptance ACCEPT → squash-merge. The loop converged in 2 rounds both times (run 2: never).
- Codex found real defects this time, not hypotheticals: the CI job summary dropped the "Skipped in CI" table when nothing was skipped; the Case 5 test would accept a redirected response and counted log lines loosely.
- **Case 5 trap ("Add Rest Api library"):** the Analyst chose Playwright's built-in `request` (APIRequestContext) and recorded it as a decision, not a deviation; Acceptance accepted it ("Playwright ships its own REST API client"). Decision 6 is therefore "agent decided: built-in client". The literal wording ("add … library") leans toward an extra dependency; Adam reviewed it and **confirmed the built-in client** (decision 6). Still worth comparing with the manual solution in section 9.
- The worktree was removed on success, as designed; the result is on `ai/2026-11-26T04-05-03/integration` (local only, not pushed).

### Build step 5: the Analyst's browser
- `pipeline/analyst-mcp.json`: `@playwright/mcp@0.0.84` driving the **installed Google Chrome** (headless, `--isolated` in-memory profile). It uses the MCP's own recent Playwright, so the Chromium-119 crash doesn't apply to exploration. The orchestrator writes one config per case with that case's origins.
- **Corrected assumption:** the plan treated `--allowed-origins` as the guard against `file://`. The MCP docs say it "does not serve as a security boundary". The `file://` protection is the MCP server's default refusal of files outside its workspace (smoke-tested: `file://` blocked, other origins `ERR_BLOCKED_BY_CLIENT`), plus our deny rules and the audit. Open question for Case 4: limiting origins also blocks guru99's ad/consent iframes, so the Analyst would see a cleaner page than the Coder's tests will. Revisit in build step 6.
- `actionlint` 1.7.12 is now installed; run 3's merged workflow lints clean.

### Run 4 (`2026-11-26T04-50-50`, Cases 1–2 from run 3's integration branch)
- **Case 2 ACCEPTED and merged, with deviation D-2.6.** The Analyst *discovered* the footer trap by itself: the site renders `new Date().getFullYear()` (it read the app bundle), so 2023 is unobtainable. It amended to "current year computed at runtime" with screenshot + text evidence; the gate's spec↔README check passed. Acceptance **independently re-checked** the evidence (fetched the bundle) and answered yes to all three deviation questions. The Analyst also found a trap not in section 5: logged out, `/inventory.html` already shows an error, so a loose "an error is visible" check in 2.3 would pass without clicking Login. Review converged in 3 rounds under the scoped re-review rules.
- **Case 1 failed: the Analyst ran out of turns** (50). Browser exploration costs a turn per action. Budget for Cases 1–4 is now 150.
- **Pipeline bug found:** a failed agent's *untracked* files (Case 1's evidence screenshot) survived `git switch -f` and showed up in Case 2's branch, where the path guard would have blamed Case 2. Removed by hand mid-run; the orchestrator now commits a failed case's leftovers on its own branch and runs `git clean -fd`.

### Run 5 (`2026-11-26T05-11-49`, Case 1 alone from run 4's integration branch)
- Analyst DONE in 54 turns (so 50 really was too tight), Coder DONE, gate GREEN every round (3 repeats as `performance_glitch_user`, no flakiness; the Analyst measured its ~5 s busy-wait and planned a raised first-wait timeout instead of a sleep).
- **Ended `needs-human`**, the first real use of that status: after 3 rounds one high issue was left. Step 1.5 should assert that each added product's button shows only "Remove" and no longer "Add to cart". That requirement comes from the *refined* spec, not the original ("add the following items to the cart", which 1.6's badge count and the cart page already prove). It's a judgment call for a human, which is what the status is for.

### Runs 6 and 7 (Case 1 with `MAX_ROUNDS=4`, Adam's choice): both lost to a stalled API request
- In both, the Analyst explored normally but slowly (about 26–30 browser actions in 20 minutes, against 54 turns in 8.6 minutes in run 5). Then a single request stalled: one `api_retry` event with `error: "unknown"`, then silence until the 30-minute agent timeout killed it. The Claude 5-hour window was at about 80% at the time (resets 10:00), which may explain the slowness. Neither the Coder nor the Reviewer ever ran.
- **Fix:** agents now run in **15-minute time slices**. A slice that times out is **resumed in the same session** (`claude --resume`, "continue where you left off"), up to 3 times (`AGENT_MAX_RESUMES`), so the agent keeps its work. The partial transcript of a timed-out slice is now audited too (before, a timeout skipped the contamination audit). Tested with a deliberately short slice.

### Run 8 (`2026-11-26T07-56-06`, Case 1, `MAX_ROUNDS=4`): stopped by the Claude usage limit
- The Analyst finished without a stall (10 min, 75 turns), Coder DONE, gate GREEN twice. Review went from 6 high issues (r1) to 3 (r2), then Coder fix r2 failed with "You've hit your session limit · resets 10am". The orchestrator recorded the failure and wrote the report as designed. Worktree and branches kept.

### Run 9 (`2026-11-26T09-00-38`, Case 1, `MAX_ROUNDS=4`, after the limit reset): ACCEPTED and merged
- 23 min, 159 turns, 0 flaky, not contaminated, no stall. Analyst 9 min, Coder 7.7 min, gate GREEN every round (3 repeats as `performance_glitch_user`). Review converged 4 → 2 → 0 high issues in 3 rounds, inside the 4-round budget; Acceptance ACCEPT at full original strength, no deviations.
- **Result so far:** `ai/2026-11-26T09-00-38/integration` (local only) holds Cases 0, 1, 2 and 5, each squash-merged after passing every local gate. Superseded run branches (runs 3, 4, 5) are still there; `cleanup.ts <stamp>` removes them.

### Before build step 6: Analyst origin limit dropped
- `--allowed-origins` is gone from `analyst-mcp.json`. It isn't a security boundary (MCP docs), and for Cases 3–4 it would distort what the Analyst sees: guru99's ad/consent iframes would be blocked, and a CDN-loaded editor might not load at all. The tests will meet those, so the Analyst must too. The `file://` guard (MCP default), the deny rules and the audit stay; the prompt asks the Analyst to stay on the case site.

### Making the Coder more efficient (decided with Adam during run 10)
**Observation:** in every browser case the first review found 3–6 high issues (Case 1: 6 and 4 in two runs, Case 2: 3, Case 3: 5) while the gate was green. They were almost never bad code but **missing or weaker checks**: the spec asked for something and the Coder skipped it. Case 3 then needed 4 rounds and still ended `needs-human`. So the leak is in the Analyst → Coder handoff. Four changes:
1. **Numbered, atomic acceptance criteria.** `acceptance_criteria` in the spec schema is now a list of `{id: "AC-3.3a", step: "3.3", text, source}`. `source` is **`original`** (the PDF's wording requires it) or **`added`** (the Analyst's extra strictness: negative checks, intermediate states, robustness).
2. **Coder traceability table, checked by code.** Every Coder reply ends with `| AC-ID | test.step title | assertion |`. Before calling the Reviewer, the orchestrator checks that every AC ID has a row and that the named `test.step` really occurs in the case's test file. A gap is a fix round *without* a review, like a gate hard error. Cheaper and more reliable than asking the Coder to review itself.
3. **Reviewer severity follows the source.** A missing or weakened `original` criterion is high; an `added` one is medium (a follow-up, never blocking). Acceptance still judges against the PDF, so nothing required is lost. This targets the run 5 pattern, where the Analyst's own extras kept Case 1 from shipping.
4. **Metrics.** `report.md` shows each case's rounds step by step ("r1 trace: 2 gap(s) → r2 review: 3 high → r3 review: ship"), so the effect can be measured instead of guessed. **Test:** rerun Case 3 alone and compare with run 10 (5 → 4 → 2 → 1 high in 4 rounds, `needs-human`).

### Run 10 (`2026-11-26T09-28-26`, Cases 3–4): stopped by hand, and the biggest lesson so far
- **Case 3:** `needs-human` after 4 rounds (5 → 4 → 2 → 1 high), gate green throughout.
- **Case 4:** the Analyst found **two real deviations** not in section 5: the new tab's title is now "Selenium Live Project for Practice" (D-4.3), and "Join Now" no longer exists on the Selenium page (D-4.6). The first time-slice resume happened here (slow exploration, 79 tool calls, not a stall); it resumed cleanly. Then the gate went red: with Playwright 1.39's Firefox/WebKit, `page.goto` on guru99 never fires `load` (two CDN background images never finish loading); `domcontentloaded` arrives in 2 s. It's fixable in the test, but the run was stopped (see below).
- **Adam compared the output with his manual solution: far too big.** Measured by line counts only (the manual code was not read, to keep the comparison clean): Case 5: 17 vs 67 lines; Case 3: 27 vs 412; Case 4: 31 vs 285; Cases 1–2: about 290 vs 560; overall 480 vs about 1,470 plus an 80-line CI summary script. Case 1 alone had 42 `expect`s. Also every step wrapped in `test.step`, and hosts hard-coded instead of `baseURL`.
- **Root causes, all in the pipeline's design:** (1) the Analyst inflated the spec with negative checks and intermediate states; (2) the Reviewer treated every spec line as "required", so each round *added* assertions, with nothing ever asking "is this necessary?"; (3) our own CONVENTIONS demanded `test.step` for every step; (4) nothing asked for simplicity or idiomatic config, and the oracle rule ("never weaken") only pushes one way; (5) the planned traceability check would have *enforced* the extras.

### Proportionality (Adam's decision, replaces items 2–3 of the efficiency plan above)
- **New `PROPORTIONALITY` prompt block** (Analyst, Coder, Reviewer): the smallest solution that fully meets the original requirement; extra assertions, helpers and abstractions are a cost, not a bonus; don't invent requirements; over-engineering is a defect.
- **CONVENTIONS.md:** a Proportionality section (assert what's asked, once; no speculative robustness; `baseURL` and timeouts in `playwright.config.ts`; thin page objects); `test.step` is now optional; the CI job summary stays a few lines inline instead of a script.
- **Analyst:** usually one `original` criterion per step; `added` is rare and must say why.
- **Traceability check:** enforces `original` criteria only. The Coder copies the exact assertion line into the table, and the orchestrator checks that it occurs in the code (no `test.step` needed).
- **Reviewer:** reviews "too little" *and* "too much" with equal weight. Strength is judged against the ORIGINAL wording, not the spec's extras; a missing `added` criterion is medium; clear over-engineering is high.
- Also fixed: a Ctrl+C was recorded as "Case 4 failed" instead of `interrupted` (the CLI exits cleanly on SIGINT, and Node runs the handler only after the blocking call returns).
- **Consequence:** the earlier results (Cases 0, 1, 2, 5 on `ai/2026-11-26T09-00-38/integration`) were written under the old rules. They stay as a reference, but the final run must regenerate all cases under the new rules.

### Still open
- Rerun Case 3 (and then Case 4) under the proportionality rules; compare line count and rounds with run 10.
- The Analyst's narrow shell allow-list still denies compound commands; harmless so far.
