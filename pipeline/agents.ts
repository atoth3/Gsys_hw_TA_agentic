// Agent wrappers + deterministic helpers, ported from ai-bootcamp/my-work/07-swarm/swarm.ts.
//
// Kept from swarm.ts (the fixes found in its first runs):
//   1. Silent failures   → every agent's exit code / is_error is checked; a crash throws AgentError.
//   2. Questions in void → the STATUS contract (checkStatus); prompts carry the UNATTENDED block.
//   7. Naive gate        → runTests() reports per-test status, compareRuns() lists flips + removals.
//  10. Stale state       → commit() is called BEFORE the status is read (done by the orchestrator).
//   +  Isolation flags   → hooks/plugins/user settings/MCP off for every agent (CLEAN_ENV).
//
// New here:
//   - stream-json transcripts, saved per call and audited for the manual solution path (contamination guard).
//   - optional --json-schema structured output (Acceptance, Claude reviewer).
//   - Ctrl+C: a SIGINT ends the running agent and throws Interrupted, so the caller can still write the report.
//   - flaky detection: with --repeat-each, mixed results for one test = "flaky" (treated as a failure).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// ── Errors + Ctrl+C ──────────────────────────────────────────────────────────
export class AgentError extends Error {}
export class Interrupted extends Error {
  constructor() { super("interrupted by Ctrl+C"); }
}

let interrupted = false;
let firstSigint = 0;
/** Ctrl+C reaches the agent child too (same process group): the child dies, we throw Interrupted after it. */
export function installInterruptHandler() {
  process.on("SIGINT", () => {
    // tsx (and npm) forward the terminal's SIGINT, so ONE Ctrl+C arrives two or three times within milliseconds.
    // Only a second Ctrl+C at least 2 s later means "give up now, skip the report".
    if (interrupted) { if (Date.now() - firstSigint > 2000) process.exit(130); return; }
    interrupted = true;
    firstSigint = Date.now();
    console.error("\n⏹  Ctrl+C: stopping the running step, then writing report.md + manifest.json …");
  });
}
export const wasInterrupted = () => interrupted;
function checkInterrupt(res?: { signal: NodeJS.Signals | null }) {
  if (interrupted || res?.signal === "SIGINT") {
    interrupted = true;
    throw new Interrupted();
  }
}

// ── Shell ────────────────────────────────────────────────────────────────────
/** Run a command, return stdout. Throws if it fails (for git, where failure = stop). */
export function sh(cmd: string, args: string[], cwd: string): string {
  checkInterrupt();
  return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 100 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Run a command, never throw; return exit code + combined output. */
export function shTry(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv, timeoutMs = 20 * 60_000) {
  checkInterrupt();
  const res = spawnSync(cmd, args, {
    cwd, encoding: "utf8", maxBuffer: 100 * 1024 * 1024, env: env ?? process.env, timeout: timeoutMs,
  });
  checkInterrupt(res);
  return { code: res.status ?? -1, out: `${res.stdout ?? ""}${res.stderr ?? ""}`, timedOut: res.error?.message.includes("ETIMEDOUT") ?? false };
}

/** Commit whatever changed. Returns false if nothing changed. */
export function commit(cwd: string, message: string): boolean {
  sh("git", ["add", "-A"], cwd);
  try {
    sh("git", ["commit", "-qm", message], cwd);
    return true;
  } catch {
    return false; // "nothing to commit"
  }
}

// ── Contamination audit ──────────────────────────────────────────────────────
// The manual solution lives in ../Gsys_hw_TA. Our own worktree is ../Gsys_hw_TA_agentic-run-<stamp>,
// so the pattern must not match "Gsys_hw_TA_" or "Gsys_hw_TA-". A bare "Gsys_hw_TA" (e.g. "ls ../Gsys_hw_TA")
// or "Gsys_hw_TA/" is a hit.
export const MANUAL_PATTERN = /Gsys_hw_TA(?![\w-])/;

/** Search tool calls (Claude) or command events (Codex) for the manual solution path. */
export function auditTranscript(jsonl: string, kind: "claude" | "codex"): string[] {
  const hits: string[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (kind === "claude") {
      // Only what the agent ASKED for (tool inputs): reading the repo's own files may legitimately mention it.
      for (const c of ev?.message?.content ?? []) {
        if (c?.type === "tool_use") {
          const s = JSON.stringify(c.input);
          if (MANUAL_PATTERN.test(s)) hits.push(`${c.name}: ${s.slice(0, 300)}`);
        }
      }
    } else {
      const item = ev?.item;
      if (item && item.type !== "agent_message" && item.type !== "reasoning") {
        const s = JSON.stringify(item.command ?? item.path ?? item.changes ?? item);
        if (MANUAL_PATTERN.test(s)) hits.push(`${item.type}: ${s.slice(0, 300)}`);
      }
    }
  }
  return hits;
}

// ── Agents ───────────────────────────────────────────────────────────────────
/** Headless agents otherwise inherit your global plugins, hooks, skills, user settings and MCP servers. */
export function cleanEnvArgs(deny: string[]): string[] {
  return [
    "--setting-sources", "project", // no user-level allow rules or plugins leak in
    "--settings", JSON.stringify({ disableAllHooks: true, permissions: { deny } }),
    "--strict-mcp-config",
    "--disable-slash-commands",
    ...(deny.length ? ["--disallowedTools", ...deny] : []),
  ];
}

export type AgentResult = {
  text: string; sessionId: string; costUsd: number; turns: number; denials: string[];
  seconds: number; structured?: unknown; contamination: string[];
};

export type ClaudeCall = {
  step: string;          // human label, e.g. "Case 5 › Analyst"
  prompt: string;
  cwd: string;
  logBase: string;       // runs/<stamp>/case-N/analyst  → .prompt.md, .jsonl, .md
  args: string[];        // permission + tool args (role-specific)
  model?: string;
  resumeId?: string;
  maxTurns?: number;
  timeoutMs?: number;
  jsonSchema?: object;   // structured output (returned in .structured)
};

/** Run headless Claude with stream-json output: we get the result AND every tool call for the audit. */
export function claude(c: ClaudeCall): AgentResult {
  console.log(`\n== ${c.step} (claude${c.model ? ` ${c.model}` : ""}${c.resumeId ? ", resumed" : ""}) ==`);
  writeFileSync(`${c.logBase}.prompt.md`, c.prompt);
  const args = [
    "-p", "--output-format", "stream-json", "--verbose",
    ...(c.model ? ["--model", c.model] : []),
    ...(c.resumeId ? ["--resume", c.resumeId] : []),
    ...(c.maxTurns ? ["--max-turns", String(c.maxTurns)] : []),
    ...(c.jsonSchema ? ["--json-schema", JSON.stringify(c.jsonSchema)] : []),
    ...c.args,
  ];
  const started = Date.now();
  checkInterrupt();
  // Prompt via stdin: diffs + specs can get long, and argv has a size limit.
  const res = spawnSync("claude", args, {
    cwd: c.cwd, input: c.prompt, encoding: "utf8", maxBuffer: 200 * 1024 * 1024,
    timeout: c.timeoutMs ?? 30 * 60_000, killSignal: "SIGTERM",
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(`${c.logBase}.jsonl`, res.stdout ?? "");
  if (res.stderr) writeFileSync(`${c.logBase}.stderr.log`, res.stderr);
  checkInterrupt(res);
  if (res.error?.message.includes("ETIMEDOUT")) throw new AgentError(`${c.step} timed out after ${seconds}s`);

  // The result event is not always the last line (summaries may follow it).
  const events = (res.stdout ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  const j = events.findLast((e) => e?.type === "result");
  if (!j) throw new AgentError(`${c.step} crashed (exit ${res.status}): ${(res.stderr || res.stdout || "").slice(-500)}`);
  // Fix 1: a failed agent is a failed step, not "no changes". error_max_turns is a failure too.
  if (res.status !== 0 || j.is_error || j.subtype !== "success") {
    throw new AgentError(`${c.step} failed (${j.subtype}, exit ${res.status}): ${String(j.result ?? "").slice(0, 500)}`);
  }
  const result: AgentResult = {
    text: String(j.result ?? ""),
    sessionId: j.session_id,
    costUsd: j.total_cost_usd ?? 0,
    turns: j.num_turns ?? 0,
    denials: (j.permission_denials ?? []).map((d: any) => `${d.tool_name}: ${JSON.stringify(d.tool_input).slice(0, 200)}`),
    seconds,
    structured: j.structured_output,
    contamination: auditTranscript(res.stdout ?? "", "claude"),
  };
  writeFileSync(`${c.logBase}.md`, result.text);
  console.log(result.text.trim().split("\n").slice(-12).join("\n"));
  console.log(`(${c.step}: ${seconds}s, ${result.turns} turns` +
    `${result.denials.length ? `, ⚠️ ${result.denials.length} permission denials` : ""}` +
    `${result.contamination.length ? `, 🚨 ${result.contamination.length} CONTAMINATION hits` : ""})`);
  return result;
}

export type CodexCall = {
  step: string; prompt: string; cwd: string; logBase: string;
  schemaFile?: string; model?: string; timeoutMs?: number;
};

/** Codex in a read-only sandbox, working root = the worktree. Final message lands in <logBase>.json. */
export function codex(c: CodexCall): AgentResult {
  console.log(`\n== ${c.step} (codex) ==`);
  writeFileSync(`${c.logBase}.prompt.md`, c.prompt);
  const outFile = `${c.logBase}.out.txt`;
  rmSync(outFile, { force: true });
  const args = [
    "exec", "-s", "read-only", "-C", c.cwd, "--json", "-o", outFile,
    ...(c.schemaFile ? ["--output-schema", c.schemaFile] : []),
    ...(c.model ? ["-m", c.model] : []),
    "-", // prompt from stdin
  ];
  const started = Date.now();
  checkInterrupt();
  const res = spawnSync("codex", args, {
    cwd: c.cwd, input: c.prompt, encoding: "utf8", maxBuffer: 200 * 1024 * 1024,
    timeout: c.timeoutMs ?? 30 * 60_000, killSignal: "SIGTERM",
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(`${c.logBase}.jsonl`, res.stdout ?? "");
  if (res.stderr) writeFileSync(`${c.logBase}.stderr.log`, res.stderr);
  checkInterrupt(res);
  if (res.error?.message.includes("ETIMEDOUT")) throw new AgentError(`${c.step} timed out after ${seconds}s`);
  if (res.status !== 0 || !existsSync(outFile)) {
    throw new AgentError(`${c.step} failed with exit ${res.status}: ${(res.stderr || "").slice(-500)}`);
  }
  const text = readFileSync(outFile, "utf8");
  const turns = (res.stdout ?? "").split("\n").filter((l) => l.includes('"item.completed"')).length;
  const contamination = auditTranscript(res.stdout ?? "", "codex");
  console.log(`(${c.step}: ${seconds}s, ${turns} items${contamination.length ? `, 🚨 ${contamination.length} CONTAMINATION hits` : ""})`);
  return { text, sessionId: "", costUsd: 0, turns, denials: [], seconds, contamination };
}

// ── STATUS contract ──────────────────────────────────────────────────────────
export type StatusLine = { status: "DONE" | "BLOCKED" | "MISSING"; line: string };

/** Fix 2: the last non-empty line must be "STATUS: DONE" or "STATUS: BLOCKED <reason>". */
export function checkStatus(text: string): StatusLine {
  const line = text.trim().split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
  const clean = line.replace(/^[*_`]+|[*_`]+$/g, ""); // tolerate **STATUS: DONE**
  if (clean.startsWith("STATUS: BLOCKED")) return { status: "BLOCKED", line: clean };
  if (clean.startsWith("STATUS: DONE")) return { status: "DONE", line: clean };
  return { status: "MISSING", line };
}

// ── Deterministic test run: per-test status ──────────────────────────────────
export type TestStatus = "passed" | "failed" | "skipped" | "flaky";
export type TestRun = {
  statuses: Map<string, TestStatus>; // "tests/case-5-rest-api.spec.ts › Case 5: … " → status
  skipReasons: Map<string, string>;
  passed: number; failed: number; flaky: number; skipped: number;
  broken: string | null;             // no report / load error / no tests: the suite itself is broken
  output: string;                    // human-readable line-reporter output (tail), for the reviewer
  jsonFile: string;
};

/**
 * Run Playwright with the line reporter (humans) + JSON reporter (per-test status).
 * With --repeat-each, a test whose repeats disagree is "flaky": the gate treats that as a failure.
 */
export function runTests(cwd: string, jsonFile: string, extraArgs: string[], env: NodeJS.ProcessEnv = {}): TestRun {
  rmSync(jsonFile, { force: true });
  const res = shTry("npx", ["playwright", "test", "--reporter=line,json", ...extraArgs], cwd,
    { ...process.env, ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile, FORCE_COLOR: "0" });
  // FORCE_COLOR=0 doesn't reach worker stderr (browser logs): strip ANSI codes so reviewers get plain text.
  const output = res.out.replace(/\x1b\[[0-9;]*m/g, "").slice(-8000);

  const statuses = new Map<string, TestStatus>();
  const skipReasons = new Map<string, string>();
  let broken: string | null = null;
  if (!existsSync(jsonFile)) {
    broken = `no JSON report (exit ${res.code}${res.timedOut ? ", timed out" : ""}): ${output.slice(-400)}`;
  } else {
    const report = JSON.parse(readFileSync(jsonFile, "utf8"));
    // Suites nest (file → describe → describe…); specs are the tests; spec.tests = one per project × repeat.
    const walk = (suite: any, path: string[]) => {
      const here = suite.title && !suite.title.endsWith(".ts") ? [...path, suite.title] : path;
      for (const spec of suite.specs ?? []) {
        const outcomes: string[] = (spec.tests ?? []).map((t: any) => t.status); // expected|unexpected|flaky|skipped
        let status: TestStatus;
        if (outcomes.length && outcomes.every((o) => o === "skipped")) status = "skipped";
        else if (outcomes.includes("flaky") || (outcomes.includes("unexpected") && outcomes.includes("expected"))) status = "flaky";
        else if (outcomes.includes("unexpected")) status = "failed";
        else status = "passed";
        const name = `${spec.file} › ${[...here, spec.title].join(" › ")}`;
        statuses.set(name, status);
        const reason = (spec.tests ?? []).flatMap((t: any) => t.annotations ?? []).find((a: any) => a.type === "skip")?.description;
        if (reason) skipReasons.set(name, reason);
      }
      for (const s of suite.suites ?? []) walk(s, here);
    };
    for (const s of report.suites ?? []) walk(s, []);
    if (report.errors?.length) broken = report.errors.map((e: any) => e.message ?? String(e)).join("\n").slice(0, 800);
    else if (statuses.size === 0) broken = `no tests found (exit ${res.code})`;
  }
  const count = (s: TestStatus) => [...statuses.values()].filter((v) => v === s).length;
  const run: TestRun = {
    statuses, skipReasons, passed: count("passed"), failed: count("failed"), flaky: count("flaky"),
    skipped: count("skipped"), broken, output, jsonFile,
  };
  console.log(`🧪 ${summarize(run)}${broken ? `  ⚠️ BROKEN: ${broken.split("\n")[0]}` : ""}`);
  return run;
}

export const summarize = (r: TestRun) =>
  `${r.passed}✓ ${r.failed}✗${r.flaky ? ` ${r.flaky}~flaky` : ""}${r.skipped ? ` ${r.skipped} skipped` : ""}`;

/** Fix 7: what changed between two runs, per test. The reviewer judges these, not the gate. */
export function compareRuns(before: TestRun, after: TestRun) {
  const flipped: string[] = [];
  const removed: string[] = [];
  for (const [name, status] of before.statuses) {
    const now = after.statuses.get(name);
    if (now === undefined) removed.push(name);
    else if (status === "passed" && now !== "passed" && now !== "skipped") flipped.push(`${name} (${now})`);
  }
  return { flipped, removed };
}

// ── Report writer ────────────────────────────────────────────────────────────
export type CaseRow = {
  id: number; title: string;
  analyst: string; coder: string; gate: string; review: string; acceptance: string;
  ci: string; skippedInCi: string; merged: string; deviations: string;
};

export function renderTable(rows: CaseRow[]): string {
  const head = "| Case | Analyst | Coder | Gate | Review | Acceptance | CI | Skipped in CI | Merged | Deviations |\n" +
    "|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((r) =>
    `| ${r.id} ${r.title} | ${r.analyst} | ${r.coder} | ${r.gate} | ${r.review} | ${r.acceptance} | ${r.ci} | ${r.skippedInCi} | ${r.merged} | ${r.deviations} |`);
  return [head, ...body].join("\n");
}

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
