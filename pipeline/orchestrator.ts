// Orchestrator: deterministic code that runs Analyst → Coder → Gate → Reviewer ⇄ Coder → Acceptance per case
// (PLAN.md sections 1–7). Everything that decides pass / fail / continue / stop is in here, not in an LLM.
//
//   npm --prefix pipeline run orchestrate -- --cases 0,5          # local mode (the only mode so far)
//   CODER_MODEL=opus REVIEWER=claude MAX_ROUNDS=2 npm --prefix pipeline run orchestrate -- --cases 0,5
//
// Local mode: a fresh worktree ../<repo>-run-<stamp>, one branch per case, accepted cases squash-merged into
// ai/<stamp>/integration, the next case branches from there. Nothing leaves this machine.
import _Ajv from "ajv";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  AgentError, type AgentResult, type CaseRow, type TestRun, Interrupted, checkStatus, claude, cleanEnvArgs, codex,
  commit, compareRuns, fmtDuration, installInterruptHandler, renderTable, runTests, sh, shTry, summarize,
} from "./agents.ts";

// ── Config ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
if (flag("merge")) {
  console.error("--merge is not built yet (PLAN.md section 11, build step 7). Run without it.");
  process.exit(2);
}
const CASE_IDS = (opt("cases") ?? "0,1,2,3,4,5").split(",").map(Number).sort((a, b) => a - b);
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 3);
const REVIEWER = process.env.REVIEWER ?? "codex"; // codex | claude
const MODELS = {
  analyst: process.env.ANALYST_MODEL ?? "opus",
  coder: process.env.CODER_MODEL ?? "sonnet",
  acceptance: process.env.ACCEPTANCE_MODEL ?? "opus",
  reviewer: process.env.REVIEWER_MODEL, // undefined = the CLI's default
};
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MIN ?? 30) * 60_000;
const TURNS = { analyst: 50, coder: 120, acceptance: 40, reviewer: 40 }; // dry run 1: Case 0 coder used 79 of 80

const PIPE = import.meta.dirname;
const CHECKOUT = resolve(PIPE, "..");
const MAIN_REPO = dirname(sh("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], CHECKOUT).trim());
const MANUAL_DIR = join(dirname(MAIN_REPO), "Gsys_hw_TA"); // the manual solution: agents must never read it
const BASE = sh("git", ["rev-parse", opt("base") ?? "HEAD"], CHECKOUT).trim();
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = join(CHECKOUT, "runs", STAMP);
const WT = join(dirname(MAIN_REPO), `${basename(MAIN_REPO)}-run-${STAMP}`);
const INTEGRATION = `ai/${STAMP}/integration`;
mkdirSync(OUT, { recursive: true });

const Ajv = ((_Ajv as any).default ?? _Ajv) as typeof _Ajv;
const ajv = new (Ajv as any)({ allErrors: true });
const loadJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const SCHEMA = {
  spec: loadJson(join(PIPE, "schemas/spec.schema.json")),
  review: loadJson(join(PIPE, "schemas/review.schema.json")),
  acceptance: loadJson(join(PIPE, "schemas/acceptance.schema.json")),
};
const validate = {
  spec: ajv.compile(SCHEMA.spec),
  review: ajv.compile(SCHEMA.review),
  acceptance: ajv.compile(SCHEMA.acceptance),
};
const ajvErrors = (v: any) => (v.errors ?? []).map((e: any) => `${e.instancePath || "/"} ${e.message}`).join("; ");
// Codex --output-schema takes the strict subset: no $schema/$id/title keywords.
const codexReviewSchema = join(OUT, "review.codex.schema.json");
{ const { $schema, $id, title, ...rest } = SCHEMA.review; writeFileSync(codexReviewSchema, JSON.stringify(rest, null, 2)); }
const acceptanceJsonSchema = (() => { const { $schema, $id, title, ...rest } = SCHEMA.acceptance; return rest; })();
const claudeReviewSchema = (() => { const { $schema, $id, title, ...rest } = SCHEMA.review; return rest; })();
const CLAUDE_REVIEWER_MODEL = process.env.CLAUDE_REVIEWER_MODEL ?? "sonnet"; // fallback when Codex is out of usage
let codexUnavailable = "";

// ── Prompts ──────────────────────────────────────────────────────────────────
const prompt = (name: string) => readFileSync(join(PIPE, "prompts", `${name}.md`), "utf8");
const SHARED = Object.fromEntries(
  prompt("shared").split(/<!-- block:(\w+) -->/).slice(1)
    .reduce<[string, string][]>((acc, part, i, arr) => (i % 2 === 0 ? [...acc, [part, arr[i + 1].trim()]] : acc), []),
);
function render(template: string, vars: Record<string, string>): string {
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`prompt variable {{${k}}} not provided`);
    return vars[k];
  });
  return out;
}
// Facts about the gate machine the agents can't measure themselves (dry run 1: Chromium 119 crashes on macOS 26).
const ENV_BLOCK = render(SHARED.ENVIRONMENT, { NODE_VERSION: process.version });

// ── Requirements ─────────────────────────────────────────────────────────────
type CaseDef = { id: number; title: string; slug: string; text: string; stepIds: string[] };
const SLUGS: Record<number, string> = { 0: "setup", 1: "purchase", 2: "mandatory-fields", 3: "editor", 4: "iframe-tabs", 5: "rest-api" };
function parseHomework(md: string): Map<number, CaseDef> {
  const cases = new Map<number, CaseDef>();
  const parts = md.split(/^## /m).slice(1);
  for (const part of parts) {
    const m = part.match(/^Case (\d+) – (.+)$/m);
    if (!m) continue;
    const id = Number(m[1]);
    const stepIds = [...part.matchAll(/\*\*((?:\d+\.\d+)|X\d+)\*\*/g)].map((s) => s[1]);
    cases.set(id, { id, title: m[2].trim(), slug: SLUGS[id], text: `## ${part.trim()}`, stepIds });
  }
  return cases;
}
const HOMEWORK = parseHomework(readFileSync(join(CHECKOUT, "requirements/homework.md"), "utf8"));
const CONVENTIONS = readFileSync(join(CHECKOUT, "CONVENTIONS.md"), "utf8");

// ── Run state, manifest, report ──────────────────────────────────────────────
type Issue = { file: string; kind: "test" | "spec-gap" | "site-issue"; severity: "high" | "medium" | "low"; problem: string; fix: string };
type Review = { ship: boolean; reason: string; issues: Issue[] };
type Acceptance = {
  case: number; verdict: "ACCEPT" | "REJECT"; reason: string;
  rows: { step: string; original: string; covered_by: string; assertion: string; deviation: string; ok: boolean; note: string }[];
  deviation_checks: { id: string; unfulfillable_as_written: boolean; smallest_change: boolean; implemented_not_weaker: boolean; note: string }[];
};
type CaseState = {
  def: CaseDef; branch: string; status: "pending" | "running" | "merged" | "failed" | "needs-human" | "interrupted";
  analyst: string; coder: string; gate: string; review: string; acceptance: string;
  rounds: number; deviations: string[]; failReason?: string; commit?: string;
  specSummary?: string; lastReview?: Review; openHigh: Issue[]; specGaps: Issue[]; siteIssues: Issue[];
  acceptanceJson?: Acceptance; flaky: string[]; denials: string[]; contamination: string[];
  seconds: number; turns: number; notes: string[];
};
const startedAt = Date.now();
const cases: CaseState[] = CASE_IDS.map((id) => {
  const def = HOMEWORK.get(id);
  if (!def) throw new Error(`Case ${id} not found in requirements/homework.md`);
  return {
    def, branch: `ai/${STAMP}/case-${id}-${def.slug}`, status: "pending", analyst: "—", coder: "—", gate: "—",
    review: "—", acceptance: "—", rounds: 0, deviations: [], openHigh: [], specGaps: [], siteIssues: [], flaky: [],
    denials: [], contamination: [], seconds: 0, turns: 0, notes: [],
  };
});

const manifest = {
  stamp: STAMP, mode: "local" as "local" | "merge", repo: MAIN_REPO, checkout: CHECKOUT, worktree: WT,
  worktreeRemoved: false, base: BASE, integrationBranch: INTEGRATION,
  branches: [] as string[],               // every local branch this run created, exact names
  remoteBranches: [] as string[],         // --merge only
  prs: [] as { number: number; title: string; case: number; state: string }[], // --merge only
  mergedCommits: [] as { sha: string; case: number; title: string; target: string }[],
  cases: {} as Record<number, { branch: string; status: string; commit?: string }>,
  finished: false, outcome: "",
};
function writeManifest() {
  for (const c of cases) manifest.cases[c.def.id] = { branch: c.branch, status: c.status, commit: c.commit };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
}

function writeReport(outcome: string) {
  const rows: CaseRow[] = cases.map((c) => ({
    id: c.def.id, title: c.def.slug, analyst: c.analyst, coder: c.coder, gate: c.gate, review: c.review,
    acceptance: c.acceptance, ci: "— (local)", skippedInCi: "—",
    merged: c.status === "merged" ? "✓ integration" : c.status === "pending" ? "—" : `✗ ${c.status}`,
    deviations: c.deviations.join(", ") || "—",
  }));
  const bullet = (i: Issue) => `- [${i.severity}] ${i.file}: ${i.problem}`;
  const yourCall = (c: CaseState) => c.status !== "needs-human" ? "" : `
**✋ Your call.** The gate is green; the reviewer still has the open issues below. Read them, then either:
- give it more rounds: \`MAX_ROUNDS=${MAX_ROUNDS + 1} npm --prefix pipeline run orchestrate -- --cases ${CASE_IDS.join(",")}\` (a fresh run), or
- accept it as is: \`git -C ${WT} switch ${INTEGRATION} && git -C ${WT} merge --squash ${c.branch} && git -C ${WT} commit -m "Case ${c.def.id}: ${c.def.title} (accepted by hand)"\`. Acceptance did not run, so check the case against the original requirement yourself.
`;
  const details = cases.map((c) => `### Case ${c.def.id}: ${c.def.title}
- Status: **${c.status}**${c.failReason ? `: ${c.failReason}` : ""}
${yourCall(c)}
- Branch: \`${c.branch}\`${c.commit ? `, merged as \`${c.commit.slice(0, 9)}\`` : ""}
- Spec: ${c.specSummary ?? "—"}
- Review rounds: ${c.rounds}; last verdict: ${c.lastReview ? `${c.lastReview.ship ? "ship" : "don't ship"} (${c.lastReview.reason})` : "—"}
- Agent time: ${fmtDuration(c.seconds)}, turns: ${c.turns}
${c.acceptanceJson ? `\n**Acceptance: ${c.acceptanceJson.verdict}**: ${c.acceptanceJson.reason}\n\n${acceptanceTable(c.acceptanceJson)}\n` : ""}
**Site issues:**\n${c.siteIssues.map(bullet).join("\n") || "none"}

**Spec gaps (reviewer):**\n${c.specGaps.map(bullet).join("\n") || "none"}

**Open high test issues:**\n${c.openHigh.map(bullet).join("\n") || "none"}

**Follow-ups (medium/low):**\n${(c.lastReview?.issues ?? []).filter((i) => i.kind === "test" && i.severity !== "high").map(bullet).join("\n") || "none"}
${c.flaky.length ? `\n**Flaky:** ${c.flaky.join(", ")}\n` : ""}${c.denials.length ? `\n**Permission denials:**\n${c.denials.map((d) => `- ${d}`).join("\n")}\n` : ""}${c.contamination.length ? `\n**🚨 Contamination hits:**\n${c.contamination.map((d) => `- ${d}`).join("\n")}\n` : ""}${c.notes.length ? `\n**Notes:**\n${c.notes.map((n) => `- ${n}`).join("\n")}\n` : ""}`).join("\n");
  const contaminated = cases.some((c) => c.contamination.length);
  writeFileSync(join(OUT, "report.md"), `# Pipeline run ${STAMP}

Outcome: ${outcome}
Mode: local (no --merge) · Cases: ${CASE_IDS.join(", ")} · Base: \`${BASE.slice(0, 9)}\` · Models: analyst ${MODELS.analyst}, coder ${MODELS.coder}, reviewer ${REVIEWER}${MODELS.reviewer ? ` ${MODELS.reviewer}` : ""}${codexUnavailable ? ` (→ claude ${CLAUDE_REVIEWER_MODEL} after Codex failed)` : ""}, acceptance ${MODELS.acceptance}

${renderTable(rows)}

Time: ${fmtDuration(Math.round((Date.now() - startedAt) / 1000))}  Turns: ${cases.reduce((s, c) => s + c.turns, 0)}  Flaky: ${cases.reduce((s, c) => s + c.flaky.length, 0)}  Local-green/CI-red: n/a (local)  Site drift on main: n/a (local)  Contaminated: ${contaminated ? "🚨 YES (results don't count for the comparison)" : "no"}

## Cases

${details}
`);
}

function acceptanceTable(a: Acceptance): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return "| Original step | Covered by | Assertion | Deviation | OK? |\n|---|---|---|---|---|\n" +
    a.rows.map((r) => `| ${r.step} ${esc(r.original)} | ${esc(r.covered_by)} | ${esc(r.assertion)} | ${esc(r.deviation)} | ${r.ok ? "✅" : `❌ ${esc(r.note)}`} |`).join("\n");
}

// ── Paths and README ownership ───────────────────────────────────────────────
// Entries ending in "/" are prefixes, others exact paths.
function analystPaths(id: number) { return [`specs/case-${id}.json`, `specs/case-${id}.md`, `docs/evidence/case-${id}/`]; }
function coderPaths(id: number) {
  const base = ["tests/", "pages/", "utils/", "test/resources/", `docs/evidence/case-${id}/`, "package.json", "package-lock.json"];
  return id === 0 ? [...base, "playwright.config.ts", "tsconfig.json", ".github/workflows/", ".gitignore", ".nvmrc"] : base;
}
const readmeKey = (h2: string, id: number) => `${h2}/Case ${id}`;
function analystReadme(id: number) { return [readmeKey("Requirement deviations", id)]; }
function coderReadme(id: number) { return id === 0 ? ["How to run", readmeKey("CI limitations", 0)] : [readmeKey("CI limitations", id)]; }

function readmeSections(md: string): Map<string, string> {
  const map = new Map<string, string>();
  let h2 = "_preamble", h3 = "", buf: string[] = [];
  const flush = () => { map.set(h3 ? `${h2}/${h3}` : h2, buf.join("\n").trimEnd()); buf = []; };
  for (const line of md.split("\n")) {
    const m2 = line.match(/^## (.+)$/);
    const m3 = line.match(/^### (Case \d+)/);
    if (m2) { flush(); h2 = m2[1].trim(); h3 = ""; }
    else if (m3) { flush(); h3 = m3[1]; }
    buf.push(line);
  }
  flush();
  return map;
}
const gitShow = (ref: string, path: string) => { try { return sh("git", ["show", `${ref}:${path}`], WT); } catch { return ""; } };

/** Changed files since `from` must be inside `allowed`; README changes must stay inside `readmeKeys`. */
function pathGuard(from: string, allowed: string[], readmeKeys: string[]): string[] {
  const errors: string[] = [];
  const changed = sh("git", ["diff", "--name-only", from, "HEAD"], WT).split("\n").filter(Boolean);
  for (const f of changed) {
    if (f === "README.md") continue;
    if (!allowed.some((a) => (a.endsWith("/") ? f.startsWith(a) : f === a))) errors.push(`changed a file outside its allowed paths: ${f}`);
  }
  if (changed.includes("README.md")) {
    const before = readmeSections(gitShow(from, "README.md"));
    const after = readmeSections(gitShow("HEAD", "README.md"));
    for (const k of new Set([...before.keys(), ...after.keys()])) {
      if ((before.get(k) ?? "") !== (after.get(k) ?? "") && !readmeKeys.includes(k)) errors.push(`changed README section it doesn't own: "${k}"`);
    }
  }
  return errors;
}

// ── Contract checks ──────────────────────────────────────────────────────────
function readSpec(id: number): { spec?: any; errors: string[] } {
  const file = join(WT, `specs/case-${id}.json`);
  if (!existsSync(file)) return { errors: [`specs/case-${id}.json is missing`] };
  let spec: any;
  try { spec = loadJson(file); } catch (e) { return { errors: [`specs/case-${id}.json is not valid JSON: ${(e as Error).message}`] }; }
  const errors: string[] = [];
  if (!validate.spec(spec)) errors.push(`schema: ${ajvErrors(validate.spec)}`);
  if (spec.case !== id) errors.push(`"case" is ${spec.case}, expected ${id}`);
  if (!existsSync(join(WT, `specs/case-${id}.md`))) errors.push(`specs/case-${id}.md is missing`);
  const covered = new Set((spec.steps ?? []).map((s: any) => String(s.id).replace(/[a-z]$/, "")));
  for (const step of HOMEWORK.get(id)!.stepIds) if (!covered.has(step)) errors.push(`original step ${step} has no refined step`);
  return { spec, errors };
}

/** Spec deviations[] and README "Requirement deviations › Case N" must match one-to-one; evidence must exist. */
function deviationCheck(id: number, spec: any): string[] {
  const errors: string[] = [];
  const readme = existsSync(join(WT, "README.md")) ? readFileSync(join(WT, "README.md"), "utf8") : "";
  const section = readmeSections(readme).get(readmeKey("Requirement deviations", id)) ?? "";
  const entries = section.split(/(?=\*\*D-)/).filter((e) => e.startsWith("**D-"));
  const readmeIds = new Set<string>();
  for (const e of entries) {
    const rid = e.match(/^\*\*D-([\w.]+):/)?.[1];
    if (!rid) { errors.push(`README entry without "**D-<step>: title**" header: ${e.slice(0, 60)}`); continue; }
    readmeIds.add(rid);
    for (const [label, re] of [["Original", /- \*\*Original:\*\*/], ["Amended", /- \*\*Amended:\*\*/],
      ["Why the original can't be fulfilled", /- \*\*Why the original can.t be fulfilled:\*\*/],
      ["Why this amendment", /- \*\*Why this amendment:\*\*/], ["Evidence", /- \*\*Evidence:\*\*/]] as const) {
      if (!re.test(e)) errors.push(`README D-${rid} is missing "${label}"`);
    }
    const paths = [...e.matchAll(/docs\/evidence\/case-\d+\/[^\s)`\]]+/g)].map((m) => m[0]);
    if (!paths.length) errors.push(`README D-${rid} names no evidence file under docs/evidence/`);
    for (const p of paths) if (!existsSync(join(WT, p))) errors.push(`README D-${rid}: evidence file ${p} does not exist`);
  }
  const specIds = new Set<string>((spec?.deviations ?? []).map((d: any) => String(d.step)));
  for (const s of specIds) if (!readmeIds.has(s)) errors.push(`spec deviation ${s} has no README entry D-${s}`);
  for (const r of readmeIds) if (!specIds.has(r)) errors.push(`README entry D-${r} has no spec deviation`);
  for (const d of spec?.deviations ?? []) {
    for (const p of String(d.evidence).match(/docs\/evidence\/case-\d+\/[^\s)`\],;]+/g) ?? []) {
      if (!existsSync(join(WT, p))) errors.push(`spec deviation ${d.step}: evidence file ${p} does not exist`);
    }
  }
  return errors;
}

function pinCheck(): string[] {
  const errors: string[] = [];
  const pkg = loadJson(join(WT, "package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["@playwright/test"] !== "1.39.0") errors.push(`package.json: @playwright/test is "${deps["@playwright/test"]}", must be exactly "1.39.0"`);
  if (deps.playwright && deps.playwright !== "1.39.0") errors.push(`package.json: playwright is "${deps.playwright}", must be exactly "1.39.0"`);
  if (!pkg.scripts?.test) errors.push(`package.json has no "test" script (precondition 0.3)`);
  const lockFile = join(WT, "package-lock.json");
  if (!existsSync(lockFile)) errors.push("package-lock.json is missing (CI runs npm ci)");
  else {
    const v = loadJson(lockFile).packages?.["node_modules/@playwright/test"]?.version;
    if (v !== "1.39.0") errors.push(`package-lock.json resolves @playwright/test to ${v}, must be 1.39.0`);
  }
  return errors;
}

// ── Gate ─────────────────────────────────────────────────────────────────────
type GateResult = { hard: string[]; tests?: TestRun; full?: TestRun; warnings: string[]; green: boolean; text: string };
let installedLockHash = "";
let browsersInstalled = false;
let gateCounter = 0;
const ACTIONLINT = shTry("which", ["actionlint"], CHECKOUT).code === 0;

function gate(c: CaseState, label: string, coderFrom: string, full: boolean): GateResult {
  const id = c.def.id;
  const n = ++gateCounter;
  console.log(`\n── Gate (${label}) ──`);
  const hard: string[] = [];
  const warnings: string[] = [];
  let tests: TestRun | undefined, fullRun: TestRun | undefined;

  hard.push(...pathGuard(coderFrom, coderPaths(id), coderReadme(id)).map((e) => `coder ${e}`));
  const { spec } = readSpec(id);
  hard.push(...deviationCheck(id, spec));

  if (!existsSync(join(WT, "package.json"))) hard.push("package.json is missing");
  else {
    hard.push(...pinCheck());
    const lock = join(WT, "package-lock.json");
    const hash = existsSync(lock) ? createHash("sha1").update(readFileSync(lock)).digest("hex") : "";
    if (hash && hash !== installedLockHash) {
      const ci = shTry("npm", ["ci", "--no-audit", "--no-fund"], WT);
      if (ci.code !== 0) hard.push(`npm ci failed (lockfile out of sync with package.json?):\n${ci.out.slice(-1500)}`);
      else installedLockHash = hash;
    }
    if (installedLockHash && !browsersInstalled) {
      const inst = shTry("npx", ["playwright", "install"], WT);
      if (inst.code !== 0) hard.push(`npx playwright install failed:\n${inst.out.slice(-1000)}`);
      else browsersInstalled = true;
    }
    if (!existsSync(join(WT, "tsconfig.json"))) hard.push("tsconfig.json is missing");
    else if (installedLockHash) {
      const tsc = shTry("npx", ["tsc", "--noEmit"], WT);
      if (tsc.code !== 0) hard.push(`npx tsc --noEmit failed:\n${tsc.out.slice(-3000)}`);
    }
    if (id === 0) {
      if (!existsSync(join(WT, ".github/workflows"))) hard.push(".github/workflows/ is missing (X1)");
      else if (ACTIONLINT) {
        const al = shTry("actionlint", [], WT);
        if (al.code !== 0) hard.push(`actionlint:\n${al.out.slice(-2000)}`);
      } else warnings.push("actionlint not installed: workflow lint SKIPPED (brew install actionlint)");
    }
    if (installedLockHash && browsersInstalled) {
      // One run with --repeat-each=3 covers both "per-test status" and "flaky = failure" (PLAN 3 ③ steps 2+3).
      tests = runTests(WT, join(OUT, `case-${id}`, `gate${n}-case.json`), [`tests/case-${id}-`, "--repeat-each=3", "--retries=0"]);
      if (tests.broken) hard.push(`case tests broken: ${tests.broken}`);
      if (full && !tests.broken) {
        // Final gate: the whole suite, CI config, no retries (PLAN 3 ③ step 8).
        console.log("Full suite (CI=true, --retries=0):");
        fullRun = runTests(WT, join(OUT, `case-${id}`, `gate${n}-full.json`), ["--retries=0"], { CI: "true" });
        if (fullRun.broken) hard.push(`full suite broken: ${fullRun.broken}`);
      }
    }
  }
  const caseTestsOk = !!tests && !tests.broken && tests.failed === 0 && tests.flaky === 0 && tests.skipped === 0;
  const fullOk = !full || (!!fullRun && !fullRun.broken && fullRun.failed === 0 && fullRun.flaky === 0);
  const green = hard.length === 0 && caseTestsOk && fullOk;
  for (const [name, s] of tests?.statuses ?? []) if (s === "flaky" && !c.flaky.includes(name)) c.flaky.push(name);

  const list = (r?: TestRun) => r ? [...r.statuses].map(([t, s]) => `  ${s.padEnd(7)} ${t}${r.skipReasons.get(t) ? ` (skip: ${r.skipReasons.get(t)})` : ""}`).join("\n") : "  (not run)";
  const text = `Gate: ${green ? "GREEN" : "RED"}
Hard errors:${hard.length ? "\n" + hard.map((h) => `- ${h}`).join("\n") : " none"}
${warnings.map((w) => `Warning: ${w}`).join("\n")}
Case tests (--repeat-each=3, flaky = failure): ${tests ? summarize(tests) : "not run"}
${list(tests)}
${full ? `Full suite (CI=true, --retries=0): ${fullRun ? summarize(fullRun) : "not run"}\n${list(fullRun)}` : ""}
Output tail:
${(tests?.output ?? "").slice(-3000)}`;
  writeFileSync(join(OUT, `case-${id}`, `gate${n}.md`), text);
  console.log(`Gate (${label}): ${green ? "GREEN" : "RED"}${hard.length ? ` (${hard.length} hard errors)` : ""}`);
  return { hard, tests, full: fullRun, warnings, green, text };
}
const gateLabel = (g: GateResult) =>
  g.green ? `✓ ${g.tests ? summarize(g.tests) : ""}` : `✗ ${g.hard.length ? `${g.hard.length} hard` : g.tests ? summarize(g.tests) : ""}${g.full && !g.hard.length ? ` · full ${summarize(g.full)}` : ""}`;

// ── Agents per role ──────────────────────────────────────────────────────────
const DENY = [
  `Read(/${MANUAL_DIR}/**)`, `Edit(/${MANUAL_DIR}/**)`, // the manual solution (contamination guard, layer 1)
  `Read(/${MAIN_REPO}/**)`, `Edit(/${MAIN_REPO}/**)`,   // your checkout: earlier runs' logs, PLAN.md
  `Read(/${WT}/PLAN.md)`, `Read(/${WT}/pipeline/**)`,     // the pipeline's own files inside the worktree (traps table!)
  "Bash(*Gsys_hw_TA/*)", "Bash(*file://*)",
];
const READ_ONLY_DENY = [...DENY, "Edit", "Write", "NotebookEdit"];
const ROLE_ARGS = {
  analyst: ["--permission-mode", "acceptEdits", "--allowedTools", "Read", "Write", "Edit", "Glob", "Grep",
    "Bash(curl:*)", "Bash(mkdir:*)", "Bash(date:*)", "Bash(npm view:*)", "Bash(node -v)", "Bash(node --version)", "Bash(npm -v)", ...cleanEnvArgs(DENY)],
  coder: ["--permission-mode", "acceptEdits", "--allowedTools", "Read", "Write", "Edit", "Glob", "Grep",
    "Bash(npx playwright test:*)", "Bash(npx playwright install:*)", "Bash(npx tsc:*)", "Bash(npm install:*)",
    "Bash(npm ci:*)", "Bash(npm test:*)", "Bash(npm run test:*)", "Bash(mkdir:*)", "Bash(ls:*)", "Bash(git status:*)",
    "Bash(git diff:*)", ...cleanEnvArgs(DENY)],
  acceptance: ["--allowedTools", "Read", "Glob", "Grep", "Bash(curl:*)", ...cleanEnvArgs(READ_ONLY_DENY)],
  reviewer: ["--allowedTools", "Read", "Glob", "Grep", "Bash(node -e:*)", "Bash(git diff:*)", "Bash(git log:*)", ...cleanEnvArgs(READ_ONLY_DENY)],
};
const CODER_COMMANDS = "`npx playwright test …`, `npx playwright install`, `npx tsc …`, `npm install …`, `npm ci`, `npm test`, `mkdir`, `ls`, `git status`, `git diff`";

function track(c: CaseState, r: AgentResult) {
  c.seconds += r.seconds; c.turns += r.turns;
  c.denials.push(...r.denials); c.contamination.push(...r.contamination);
  return r;
}

function analystToolsNote(id: number) {
  if (id === 0) return "No browser for this case. Shell: `curl` (for documentation pages), `npm view <package>` (published versions, engines), `mkdir`, `date`.\n" +
    "How Case 0 is verified (fixed by the pipeline, so plan your refined steps around it): the pipeline's gate checks the exact Playwright pin in package.json and the lockfile, that an `npm test` script exists and runs the suite, `tsc`, and lints the workflow with `actionlint`; the CI run itself proves X1. Playwright tests must NOT parse package.json or workflow YAML. The single smoke test opens a real page in the chosen browser. For each 0.x / X1 step, say in `refined` which of these verifies it.";
  if (id === 5) return "No browser for this case: it is an HTTP API, explore it with `curl`. Shell: `curl`, `mkdir`, `date`.";
  return "No browser yet (pipeline build step 5 adds one): use `curl` to fetch pages. Shell: `curl`, `mkdir`, `date`.";
}

function earlierSpecs(id: number): string {
  const dir = join(WT, "specs");
  if (!existsSync(dir)) return "(none yet)";
  const files = readdirSync(dir).filter((f) => /^case-\d+\.json$/.test(f) && f !== `case-${id}.json`);
  if (!files.length) return "(none yet)";
  return files.map((f) => {
    const s = loadJson(join(dir, f));
    return `- ${f}: ${s.summary} | test_data: ${JSON.stringify(s.test_data)}`;
  }).join("\n");
}

const projectFiles = () => sh("git", ["ls-files"], WT).split("\n").filter((f) => f && !f.startsWith("pipeline/") && f !== "PLAN.md").join("\n");
const caseDir = (id: number) => join(OUT, `case-${id}`);
const head = () => sh("git", ["rev-parse", "HEAD"], WT).trim();
const diffFor = (from: string) => {
  const d = sh("git", ["diff", from, "HEAD", "--", ".", ":(exclude)package-lock.json"], WT);
  return d.length > 150_000 ? d.slice(0, 150_000) + "\n… (diff truncated)" : d;
};

// ── Case flow ────────────────────────────────────────────────────────────────
class CaseFailed extends Error {}
const failCase = (c: CaseState, reason: string): never => { c.failReason = reason; throw new CaseFailed(reason); };
class NeedsHuman extends CaseFailed {}
const needsHuman = (c: CaseState, reason: string): never => { c.failReason = reason; throw new NeedsHuman(reason); };

function runAnalyst(c: CaseState): any {
  const id = c.def.id;
  const base = render(prompt("analyst"), {
    CASE_ID: String(id), CASE_TITLE: c.def.title, CASE_TEXT: c.def.text, STEP_IDS: c.def.stepIds.join(", "),
    TOOLS_NOTE: analystToolsNote(id), TODAY: new Date().toISOString().slice(0, 10), FILES: projectFiles(),
    EARLIER_SPECS: earlierSpecs(id), SPEC_SCHEMA: JSON.stringify(SCHEMA.spec, null, 2),
  }) + `\n\n${SHARED.ISOLATION}\n\n${ENV_BLOCK}\n\n${SHARED.UNATTENDED}`;
  const from = head();
  let r = track(c, claude({ step: `Case ${id} › Analyst`, prompt: base, cwd: WT, logBase: join(caseDir(id), "analyst"),
    args: ROLE_ARGS.analyst, model: MODELS.analyst, maxTurns: TURNS.analyst, timeoutMs: TIMEOUT_MS }));
  // One repair attempt for contract errors (resumed, so it keeps its exploration).
  for (let attempt = 1; ; attempt++) {
    commit(WT, `Case ${id}: analyst spec${attempt > 1 ? ` (repair ${attempt - 1})` : ""}`);
    const status = checkStatus(r.text);
    if (status.status === "BLOCKED") { c.analyst = "BLOCKED"; failCase(c, `Analyst: ${status.line}`); }
    if (status.status === "MISSING") c.notes.push(`Analyst broke the STATUS contract (last line: "${status.line.slice(0, 80)}")`);
    const { spec, errors } = readSpec(id);
    errors.push(...pathGuard(from, analystPaths(id), analystReadme(id)).map((e) => `analyst ${e}`));
    if (spec) errors.push(...deviationCheck(id, spec));
    if (spec?.status === "BLOCKED") { c.analyst = "BLOCKED"; failCase(c, `Analyst spec status BLOCKED: ${spec.blocked_reason ?? ""}`); }
    writeFileSync(join(caseDir(id), `analyst-contract-${attempt}.txt`), errors.join("\n") || "ok");
    if (!errors.length) {
      c.analyst = attempt > 1 ? "DONE (repaired)" : "DONE";
      c.specSummary = spec.summary;
      c.deviations = (spec.deviations ?? []).map((d: any) => `D-${d.step}`);
      writeFileSync(join(caseDir(id), "spec.json"), JSON.stringify(spec, null, 2));
      return spec;
    }
    console.warn(`⚠️  Analyst contract errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    if (attempt === 2) { c.analyst = "✗ contract"; failCase(c, `Analyst broke the contract: ${errors.join("; ")}`); }
    r = track(c, claude({ step: `Case ${id} › Analyst (repair)`, cwd: WT, logBase: join(caseDir(id), "analyst-repair"),
      prompt: `The pipeline rejected your spec. Fix ONLY these contract errors, then end with the STATUS line:\n${errors.map((e) => `- ${e}`).join("\n")}\n\n${SHARED.UNATTENDED}`,
      args: ROLE_ARGS.analyst, model: MODELS.analyst, maxTurns: 20, timeoutMs: TIMEOUT_MS, resumeId: r.sessionId }));
  }
}

function coderPrompt(c: CaseState, spec: any): string {
  const id = c.def.id;
  const allowed = [...coderPaths(id).map((p) => `- \`${p}\``),
    ...coderReadme(id).map((k) => `- README.md section "${k.replace("/", " › ")}" (nothing else in README.md)`)].join("\n");
  const case0 = id !== 0 ? "" : `
This is Case 0: you create the project skeleton every later case builds on: \`package.json\` (with the \`npm test\` runner script) and its \`package-lock.json\` (run \`npm install\`), \`tsconfig.json\`, \`playwright.config.ts\`, the GitHub Actions workflow for X1 in \`.github/workflows/\`, one smoke test \`tests/case-0-smoke.spec.ts\` so CI has something to run, and the "How to run" section of README.md. Install the browsers with \`npx playwright install\`.`;
  return render(prompt("coder"), {
    CASE_ID: String(id), CASE_TITLE: c.def.title, CASE_TEXT: c.def.text, SPEC_JSON: JSON.stringify(spec, null, 2),
    CONVENTIONS, ALLOWED_PATHS: allowed, CASE0_NOTE: case0, ALLOWED_COMMANDS: CODER_COMMANDS, TEST_FILTER: `tests/case-${id}-`,
  }) + `\n\n${SHARED.ORACLE}\n\n${SHARED.ISOLATION}\n\n${ENV_BLOCK}\n\n${SHARED.UNATTENDED}`;
}

/** Re-review scope (dry run 2: each round found NEW highs, so the loop never converged). */
function reReviewNote(prev: Issue[]): string {
  return `This is a RE-REVIEW after fixes. Scope it tightly:
1. First check that each previously blocking issue below is really fixed. One that is not fixed stays HIGH.
2. A NEW high issue counts only if (a) the fixes themselves introduced it, or (b) you can show that a step of the refined spec or the original requirement is not met by the current code.
3. Anything else you notice now that you could have reported in an earlier round: report it as medium (a follow-up), not high.
Do not repeat resolved issues.${prev.length ? `\n\nPreviously blocking issues:\n${prev.map((i) => `- ${i.file}: ${i.problem}`).join("\n")}` : ""}`;
}

function review(c: CaseState, round: number, spec: any, caseBase: string, coderSummary: string, g: GateResult, changes: string, label: string, prev: Issue[] = []): Review {
  const id = c.def.id;
  const p = render(prompt("reviewer"), {
    CASE_ID: String(id), CASE_TITLE: c.def.title, CASE_TEXT: c.def.text, SPEC_JSON: JSON.stringify(spec, null, 2),
    CONVENTIONS, CODER_SUMMARY: coderSummary, GATE: g.text, DIFF: diffFor(caseBase),
    ROUND_NOTE: round > 1 ? reReviewNote(prev) : "",
    CHANGES: changes ? `\n# Changes since the previous test run (judge each one)\n${changes}\n- A test that flipped pass → fail is fine only if it was tightened and now correctly shows a site issue; otherwise it is a HIGH test issue.\n- A removed test is a HIGH test issue unless it was a duplicate or genuinely wrong.\n` : "",
  }) + `\n\n${SHARED.ISOLATION}\n\n${ENV_BLOCK}\nYou run unattended: never ask questions. Your whole reply is the JSON object.`;
  const logBase = join(caseDir(id), `review-${label}`);
  const viaClaude = (base: string) => claude({ step: `Case ${id} › Reviewer ${label}`, prompt: p, cwd: WT, logBase: base, args: ROLE_ARGS.reviewer,
    model: REVIEWER === "claude" ? MODELS.reviewer : CLAUDE_REVIEWER_MODEL, maxTurns: TURNS.reviewer, timeoutMs: TIMEOUT_MS, jsonSchema: claudeReviewSchema });
  let r: AgentResult;
  if (REVIEWER === "codex" && !codexUnavailable) {
    try {
      r = codex({ step: `Case ${id} › Reviewer ${label}`, prompt: p, cwd: WT, logBase, schemaFile: codexReviewSchema, model: MODELS.reviewer, timeoutMs: TIMEOUT_MS });
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      // Codex on a free plan runs out of usage: fall back to Claude for the rest of the run, and say so.
      codexUnavailable = (e as Error).message.slice(0, 300);
      c.notes.push(`Codex reviewer failed (${codexUnavailable}); Claude ${CLAUDE_REVIEWER_MODEL} reviews from here on`);
      console.warn(`⚠️  Codex failed, falling back to the Claude reviewer for the rest of the run`);
      r = viaClaude(`${logBase}-claude`);
    }
  } else r = viaClaude(logBase);
  track(c, r);
  let parsed: any = r.structured;
  if (!parsed) {
    try { parsed = JSON.parse(r.text.trim()); } catch (e) { failCase(c, `Reviewer broke the JSON contract: ${(e as Error).message}`); }
  }
  if (!validate.review(parsed)) failCase(c, `Reviewer broke the JSON contract: ${ajvErrors(validate.review)}`);
  writeFileSync(`${logBase}.json`, JSON.stringify(parsed, null, 2));
  const rv = parsed as Review;
  const add = (list: Issue[], i: Issue) => { if (!list.some((x) => x.problem === i.problem)) list.push(i); };
  for (const i of rv.issues) {
    if (i.kind === "spec-gap") add(c.specGaps, i);
    if (i.kind === "site-issue") add(c.siteIssues, i);
  }
  c.lastReview = rv;
  console.log(`Review ${label}: ship=${rv.ship} (${rv.reason.slice(0, 120)}) | ${rv.issues.length} issues: ` +
    `${rv.issues.filter((i) => i.kind === "test" && i.severity === "high").length} high test, ` +
    `${rv.issues.filter((i) => i.kind === "spec-gap").length} spec-gap, ${rv.issues.filter((i) => i.kind === "site-issue").length} site-issue`);
  return rv;
}

/** High test issues, plus failing tests the reviewer didn't explain as a site issue. */
function blockingIssues(rv: Review, g: GateResult): Issue[] {
  const blocking = rv.issues.filter((i) => i.kind === "test" && i.severity === "high");
  const explained = rv.issues.some((i) => i.kind === "site-issue");
  if (!g.green && !explained && blocking.length === 0) {
    blocking.push({ file: "(gate)", kind: "test", severity: "high", problem: `The pipeline's gate is RED:\n${g.text.slice(0, 2500)}`, fix: "Make the gate green, or explain in your reply why the failure is a real site issue." });
  }
  return blocking;
}

function fixRound(c: CaseState, coderSession: string, label: string, body: string): AgentResult {
  const id = c.def.id;
  const r = track(c, claude({ step: `Case ${id} › Coder fix ${label}`, cwd: WT, logBase: join(caseDir(id), `coder-fix-${label}`),
    prompt: `${body}\nIf you disagree with an issue, don't change the code: explain why. Re-run the tests.\n\n${SHARED.ORACLE}\n\n${SHARED.UNATTENDED}`,
    args: ROLE_ARGS.coder, model: MODELS.coder, maxTurns: TURNS.coder, timeoutMs: TIMEOUT_MS, resumeId: coderSession }));
  if (!commit(WT, `Case ${id}: coder fix ${label}`)) c.notes.push(`Coder fix ${label}: no changes`);
  const st = checkStatus(r.text);
  if (st.status === "BLOCKED") { c.coder = "BLOCKED"; failCase(c, `Coder fix ${label}: ${st.line}`); }
  if (st.status === "MISSING") c.notes.push(`Coder fix ${label} broke the STATUS contract`);
  return r;
}

function runAcceptance(c: CaseState, attempt: number, caseBase: string, g: GateResult): Acceptance {
  const id = c.def.id;
  const sections = readmeSections(readFileSync(join(WT, "README.md"), "utf8"));
  const changed = sh("git", ["diff", "--name-only", caseBase, "HEAD"], WT).split("\n")
    .filter((f) => f && !f.startsWith("specs/") && f !== "package-lock.json").join("\n");
  const p = render(prompt("acceptance"), {
    CASE_ID: String(id), CASE_TITLE: c.def.title, CASE_TEXT: c.def.text, STEP_IDS: c.def.stepIds.join(", "),
    CHANGED_FILES: changed,
    README_SECTIONS: ["Requirement deviations", "CI limitations"].map((h) => `\n${sections.get(readmeKey(h, id)) ?? `(no "${h}" section for Case ${id})`}`).join("\n"),
    SPEC_GAPS: c.specGaps.map((i) => `- ${i.file}: ${i.problem}`).join("\n") || "none",
    GATE: g.text.slice(0, 6000),
    TOOLS_NOTE: "Tools: read files (Read, Glob, Grep) and `curl` for one read-only re-check of a deviation's evidence. You cannot edit anything. Do not read specs/: judge against the original text.",
  }) + `\n\n${SHARED.ORACLE}\n\n${SHARED.ISOLATION}\n\n${ENV_BLOCK}\nYou run unattended: never ask questions.`;
  const r = track(c, claude({ step: `Case ${id} › Acceptance ${attempt}`, prompt: p, cwd: WT, logBase: join(caseDir(id), `acceptance-${attempt}`),
    args: ROLE_ARGS.acceptance, model: MODELS.acceptance, maxTurns: TURNS.acceptance, timeoutMs: TIMEOUT_MS, jsonSchema: acceptanceJsonSchema }));
  const a = r.structured as Acceptance | undefined;
  if (!a || !validate.acceptance(a)) failCase(c, `Acceptance broke the JSON contract: ${a ? ajvErrors(validate.acceptance) : "no structured output"}`);
  const acc = a as Acceptance;
  // Deterministic consistency checks: the verdict must follow from the rows.
  const rowSteps = acc.rows.map((x) => x.step);
  const missing = c.def.stepIds.filter((s) => !rowSteps.includes(s));
  const problems: string[] = [];
  if (missing.length) problems.push(`no row for original step(s) ${missing.join(", ")}`);
  if (acc.case !== id) problems.push(`case is ${acc.case}, expected ${id}`);
  if (acc.verdict === "ACCEPT" && acc.rows.some((x) => !x.ok)) problems.push("ACCEPT although a row is not ok");
  if (acc.verdict === "ACCEPT" && acc.deviation_checks.some((d) => !d.unfulfillable_as_written || !d.smallest_change || !d.implemented_not_weaker)) problems.push("ACCEPT although a deviation check failed");
  if (problems.length) {
    c.notes.push(`Acceptance ${attempt} contract: ${problems.join("; ")} → treated as REJECT`);
    acc.verdict = "REJECT";
    acc.reason = `[pipeline] ${problems.join("; ")}. ${acc.reason}`;
  }
  writeFileSync(join(caseDir(id), `acceptance-${attempt}.json`), JSON.stringify(acc, null, 2));
  c.acceptanceJson = acc;
  console.log(`Acceptance ${attempt}: ${acc.verdict}: ${acc.reason.slice(0, 200)}`);
  return acc;
}

function runCase(c: CaseState) {
  const id = c.def.id;
  mkdirSync(caseDir(id), { recursive: true });
  c.status = "running";
  sh("git", ["switch", "-q", "-c", c.branch, INTEGRATION], WT);
  manifest.branches.push(c.branch);
  writeManifest();
  const caseBase = head();
  console.log(`\n══════ Case ${id}: ${c.def.title} (branch ${c.branch}) ══════`);

  if (id === 0) {
    // The orchestrator writes the README skeleton BEFORE the first Analyst, so it has somewhere to write into.
    writeFileSync(join(WT, "README.md"), readFileSync(join(PIPE, "readme-template.md"), "utf8"));
    commit(WT, "Case 0: README skeleton (orchestrator)");
  }
  if (id !== 0 && !existsSync(join(WT, "package.json"))) failCase(c, "no project skeleton (Case 0 not merged into the base)");

  // ① Analyst
  const spec = runAnalyst(c);
  const analystDone = head();

  // ② Coder
  const coder = track(c, claude({ step: `Case ${id} › Coder`, prompt: coderPrompt(c, spec), cwd: WT, logBase: join(caseDir(id), "coder"),
    args: ROLE_ARGS.coder, model: MODELS.coder, maxTurns: TURNS.coder, timeoutMs: TIMEOUT_MS }));
  const changed = commit(WT, `Case ${id}: coder`); // fix 10: commit + measure before reading the status
  let g = gate(c, "after coder", analystDone, false);
  const st = checkStatus(coder.text);
  if (st.status === "BLOCKED") { c.coder = "BLOCKED"; failCase(c, `Coder: ${st.line}`); }
  if (st.status === "MISSING") c.notes.push(`Coder broke the STATUS contract (last line: "${st.line.slice(0, 80)}")`);
  if (!changed) { c.coder = "✗ no changes"; failCase(c, "Coder reported DONE but changed nothing"); }
  c.coder = st.status === "DONE" ? "DONE" : "DONE (no STATUS)";
  c.gate = gateLabel(g);

  // ③④ Gate + Reviewer ⇄ Coder (resumed)
  let summary = coder.text;
  let changes = "";
  let rv: Review | undefined;
  let blocking: Issue[] = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    c.rounds = round;
    if (g.hard.length) {
      // A gate with hard errors (tsc, path guard, pin, broken suite…) goes straight back to the coder: nothing to review yet.
      blocking = g.hard.map((h) => ({ file: "(gate)", kind: "test" as const, severity: "high" as const, problem: h, fix: "" }));
      if (round === MAX_ROUNDS) break;
      const fix = fixRound(c, coder.sessionId, `r${round}-gate`, `The pipeline's gate found hard errors in your work. Fix them:\n${g.hard.map((h) => `- ${h}`).join("\n")}`);
      summary += `\n\nFIXES (round ${round}, gate errors):\n${fix.text}`;
      const before = g;
      g = gate(c, `after gate fix r${round}`, analystDone, false);
      changes = diffChanges(before, g);
      continue;
    }
    rv = review(c, round, spec, caseBase, summary, g, changes, `r${round}`, blocking);
    blocking = blockingIssues(rv, g);
    if (rv.ship && blocking.length === 0) break;
    if (blocking.length === 0) { c.notes.push(`Round ${round}: ship=false without a high test issue: nothing concrete to fix`); break; }
    if (round === MAX_ROUNDS) { c.notes.push(`Round budget (${MAX_ROUNDS}) used up with ${blocking.length} blocking issues`); break; }
    const fix = fixRound(c, coder.sessionId, `r${round}`, `A reviewer found these blocking issues. Fix them:\n${JSON.stringify(blocking, null, 2)}`);
    summary += `\n\nFIXES (round ${round}):\n${fix.text}`;
    const before = g;
    g = gate(c, `after fix r${round}`, analystDone, false);
    changes = diffChanges(before, g);
  }
  c.openHigh = blocking;
  c.review = rv ? `${rv.ship ? "ship" : "no ship"} (${c.rounds} rnd)${blocking.length ? `, ${blocking.length} high open` : ""}` : `✗ not reviewed (${c.rounds} rnd)`;

  // ③ step 8: final gate on the full suite
  g = gate(c, "final (full suite)", analystDone, true);
  c.gate = gateLabel(g);
  if (!g.green) failCase(c, `final gate RED${c.siteIssues.length ? " (site issue reported)" : ""}`);
  if (!rv) return failCase(c, "never reviewed (gate errors every round)");
  // Gate green but the reviewer still says no after the budget (or contradicts itself): the user decides, not the loop.
  if (!rv.ship || blocking.length) needsHuman(c, blocking.length
    ? `review budget (${MAX_ROUNDS} rounds) used up with ${blocking.length} high issue(s) open; gate is green`
    : "reviewer said ship=false without a concrete high issue; gate is green");

  // ⑤ Acceptance (fresh session, sees the ORIGINAL text)
  let acc = runAcceptance(c, 1, caseBase, g);
  c.acceptance = acc.verdict;
  if (acc.verdict === "REJECT") {
    const fix = fixRound(c, coder.sessionId, "acceptance", `The Acceptance check (against the ORIGINAL requirement) REJECTED the case:\n${acc.reason}\nRows not ok:\n${acc.rows.filter((x) => !x.ok).map((x) => `- ${x.step}: ${x.note}`).join("\n")}\nFix the code. If a difference from the original is a justified requirement deviation, that is the Analyst's job, not yours: say so instead of changing the README deviations.`);
    summary += `\n\nFIXES (acceptance):\n${fix.text}`;
    const before = g;
    g = gate(c, "after acceptance fix (full suite)", analystDone, true);
    c.gate = gateLabel(g);
    rv = review(c, c.rounds + 1, spec, caseBase, summary, g, diffChanges(before, g), "acceptance"); // changed code is never merged unreviewed
    blocking = blockingIssues(rv, g);
    c.openHigh = blocking;
    c.review += ` + 1 after REJECT (${rv.ship ? "ship" : "no ship"})`;
    if (!rv.ship || blocking.length || !g.green) { c.acceptance = "REJECT"; failCase(c, "after the acceptance fix: reviewer or gate not green"); }
    acc = runAcceptance(c, 2, caseBase, g);
  }
  c.acceptance = acc.verdict;
  if (acc.verdict !== "ACCEPT") failCase(c, "Acceptance REJECT");

  // ⑥–⑧ local mode: squash-merge into the integration branch
  sh("git", ["switch", "-q", INTEGRATION], WT);
  sh("git", ["merge", "--squash", c.branch], WT);
  const msg = `Case ${id}: ${c.def.title}\n\n${acceptanceTable(acc)}\n\nBranch: ${c.branch}\nPipeline run: ${STAMP}`;
  sh("git", ["commit", "-qm", msg], WT);
  c.commit = head();
  manifest.mergedCommits.push({ sha: c.commit, case: id, title: c.def.title, target: INTEGRATION });
  c.status = "merged";
  writeManifest();
  console.log(`✅ Case ${id} merged into ${INTEGRATION} as ${c.commit.slice(0, 9)}`);
}

function diffChanges(before: GateResult, after: GateResult): string {
  if (!before.tests || !after.tests) return "";
  const { flipped, removed } = compareRuns(before.tests, after.tests);
  const s = [...flipped.map((t) => `- FLIPPED pass → not passing: ${t}`), ...removed.map((t) => `- REMOVED: ${t}`)].join("\n");
  if (s) console.log(`🔎 For the reviewer to judge:\n${s}`);
  return s;
}

// ══ Main ═════════════════════════════════════════════════════════════════════
installInterruptHandler();
const cleanupCmd = `npm --prefix pipeline run cleanup -- ${STAMP}`;
function finish(outcome: string, code: number): never {
  manifest.finished = true;
  manifest.outcome = outcome;
  writeManifest();
  writeReport(outcome);
  const allMerged = cases.every((c) => c.status === "merged");
  if (allMerged && !flag("keep-worktree") && code === 0) {
    shTry("git", ["worktree", "remove", "--force", WT], CHECKOUT);
    manifest.worktreeRemoved = true;
    writeManifest();
  }
  console.log(`\n══ ${outcome} ══
${cases.map((c) => `Case ${c.def.id}: ${c.status}${c.failReason ? ` (${c.failReason})` : ""}`).join("\n")}
Report: ${join(OUT, "report.md")}
${manifest.worktreeRemoved ? `Worktree removed; result is on branch ${INTEGRATION}` : `Worktree kept for inspection: ${WT}`}
Remove this run completely: ${cleanupCmd}`);
  process.exit(code);
}

console.log(`Run ${STAMP}: cases ${CASE_IDS.join(",")} · base ${BASE.slice(0, 9)} · logs ${OUT}`);
let current: CaseState | undefined;
try {
  sh("git", ["worktree", "add", "-q", "-b", INTEGRATION, WT, BASE], CHECKOUT);
  manifest.branches.push(INTEGRATION);
  writeManifest();
  for (const c of cases) {
    current = c;
    try {
      runCase(c);
    } catch (e) {
      if (e instanceof Interrupted) throw e;
      if (!(e instanceof CaseFailed) && !(e instanceof AgentError)) throw e;
      c.status = e instanceof NeedsHuman ? "needs-human" : "failed";
      c.failReason ??= (e as Error).message;
      console.error(`${c.status === "needs-human" ? "✋" : "❌"} Case ${c.def.id} ${c.status}: ${c.failReason}`);
      shTry("git", ["switch", "-q", "-f", INTEGRATION], WT); // next case starts from integration without it
      writeManifest();
      writeReport("running");
      if (c.def.id === 0) {
        for (const rest of cases.filter((x) => x.status === "pending")) rest.notes.push(`not run: Case 0 ${c.status}`);
        finish(c.status === "needs-human"
          ? "NEEDS HUMAN: Case 0 (skeleton) is waiting for your call (see report), nothing after it can run"
          : "FAILED: Case 0 (skeleton) failed, nothing after it can work", 1);
      }
    }
  }
  const failed = cases.filter((c) => c.status !== "merged");
  finish(failed.length ? `completed with ${failed.length} failed case(s)` : "completed: all cases merged", failed.length ? 1 : 0);
} catch (e) {
  if (e instanceof Interrupted) {
    if (current) { current.status = "interrupted"; current.failReason = "Ctrl+C"; }
    finish("INTERRUPTED (Ctrl+C)", 130);
  }
  console.error(e);
  if (current && current.status === "running") { current.status = "failed"; current.failReason = `pipeline crash: ${(e as Error).message}`; }
  finish(`CRASHED: ${(e as Error).message}`, 1);
}
