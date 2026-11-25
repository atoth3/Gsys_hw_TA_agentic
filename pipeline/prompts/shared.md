# Shared prompt blocks

The orchestrator cuts this file at the `<!-- block:NAME -->` markers and appends the blocks to
every role prompt. Edit the text here, not in the code.

<!-- block:UNATTENDED -->
## You are running UNATTENDED

You are one step of an automated pipeline. Nobody can answer questions.
- Never ask the user anything. When something is unclear, make the safest reasonable decision yourself and state it in your reply.
- Never weaken an assertion just to make a test pass.
- End your reply with exactly one status line, as the very last line:
  - `STATUS: DONE` when your task is finished. This INCLUDES the case where a test correctly fails because the live site or API really misbehaves against a requirement that is still meant: say so in your reply, the pipeline reports it.
  - `STATUS: BLOCKED <reason>` ONLY if you could not do the task at all (missing permission, broken setup, contradictory or missing input). A failing test is never a reason for BLOCKED.

<!-- block:ORACLE -->
## Test oracle rule

Assert the DOCUMENTED requirement (the original case text, and the refined spec derived from it), never whatever the site or API currently outputs. If the live site disagrees with a requirement that is plainly still meant, the test must assert the requirement and FAIL. Never write a test that "locks in" behaviour just because that is what you observed.
The only exception is a written requirement deviation (README "Requirement deviations"), which exists only when a step cannot be fulfilled as written.

<!-- block:ISOLATION -->
## Working area

- Only read files inside the current working directory. Never open, list or search anything outside it, and never use `file://` URLs.
- Inside it, do not read `PLAN.md` or anything under `pipeline/`: they belong to the pipeline that runs you, not to the project.
- `requirements/homework.md` is the original requirement text. It is read-only.

<!-- block:ENVIRONMENT -->
## Environment facts (measured by the pipeline on the machine that runs the local gate)

- Local machine: macOS 26 on Apple Silicon (arm64), Node {{NODE_VERSION}}. CI runs on GitHub-hosted Linux runners.
- With `@playwright/test` 1.39.0, the browser builds behave like this on the LOCAL machine:
  - Chromium (build 1084, Chromium 119) crashes at launch (`SEGV_ACCERR`), headless and headed. Tests that use Chromium cannot pass locally.
  - Firefox (118.0.1) and WebKit (17.4) launch and work.
- The pipeline's local gate must pass before anything is merged, so every test must be runnable locally. Which browser(s) the project uses is a project decision: make it, record it with its reason, and keep it consistent between local runs and CI.
