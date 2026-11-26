// Remove ONE pipeline run by its manifest (PLAN.md section 6).
//
//   npm --prefix agentic/pipeline run cleanup -- <stamp>              list, then ask
//   npm --prefix agentic/pipeline run cleanup -- <stamp> --dry-run    list only
//   npm --prefix agentic/pipeline run cleanup -- <stamp> --yes        no question
//   npm --prefix agentic/pipeline run cleanup -- <stamp> --purge-logs also delete agentic/runs/<stamp>/
//
// Rules: list first, then delete. Exact names from agentic/runs/<stamp>/manifest.json, checked against what exists:
// no `ai/*` globbing, so it can never touch another run. Never touches main or merged work: it only PRINTS
// `git revert` for case commits merged into main. Idempotent: removes only what is still there.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const stamp = argv.find((a) => !a.startsWith("--"));
const dryRun = argv.includes("--dry-run");
const yes = argv.includes("--yes");
const purgeLogs = argv.includes("--purge-logs");
if (!stamp || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(stamp)) {
  console.error("Usage: cleanup.ts <stamp> [--dry-run] [--yes] [--purge-logs]   (stamp like 2026-11-26T09-14-03)");
  process.exit(2);
}
const CHECKOUT = resolve(import.meta.dirname, "../..");
const runDir = join(CHECKOUT, "agentic", "runs", stamp);
const manifestFile = join(runDir, "manifest.json");
if (!existsSync(manifestFile)) { console.error(`No manifest: ${manifestFile}`); process.exit(1); }
const m = JSON.parse(readFileSync(manifestFile, "utf8"));
const repo: string = m.repo;

const ok = (cmd: string, args: string[], cwd = repo) => spawnSync(cmd, args, { cwd, encoding: "utf8" }).status === 0;
const out = (cmd: string, args: string[], cwd = repo) => execFileSync(cmd, args, { cwd, encoding: "utf8" });

// Safety: every branch name must belong to THIS run (prefix ai/<stamp>/) and must not be main.
const own = (b: string) => b.startsWith(`ai/${stamp}/`) && b !== "main";

type Item = { label: string; name: string; remove: () => void };
const items: Item[] = [];

ok("git", ["worktree", "prune"]); // a worktree folder deleted by hand
const worktrees = out("git", ["worktree", "list", "--porcelain"]);
if (m.worktree && worktrees.includes(`worktree ${m.worktree}\n`)) {
  items.push({ label: "worktree", name: m.worktree, remove: () => out("git", ["worktree", "remove", "--force", m.worktree]) });
} else if (m.worktree && existsSync(m.worktree)) {
  items.push({ label: "folder", name: m.worktree, remove: () => rmSync(m.worktree, { recursive: true, force: true }) });
}

const merged = new Set<string>((m.mergedCommits ?? []).filter((c: any) => c.target === "main").map((c: any) => c.sha));
for (const b of m.branches ?? []) {
  if (!own(b)) { console.warn(`skipping "${b}": not a branch of run ${stamp}`); continue; }
  if (ok("git", ["show-ref", "--verify", "--quiet", `refs/heads/${b}`])) {
    items.push({ label: "local branch", name: b, remove: () => out("git", ["branch", "-D", b]) });
  }
}
for (const b of m.remoteBranches ?? []) {
  if (!own(b)) continue;
  if (ok("git", ["ls-remote", "--exit-code", "--heads", "origin", b])) {
    items.push({ label: "remote branch", name: `origin/${b}`, remove: () => out("git", ["push", "origin", "--delete", b]) });
  }
}
for (const pr of m.prs ?? []) {
  if (pr.state === "MERGED") continue;
  const state = spawnSync("gh", ["pr", "view", String(pr.number), "--json", "state", "-q", ".state"], { cwd: repo, encoding: "utf8" }).stdout?.trim();
  if (state === "OPEN") items.push({ label: "draft PR", name: `#${pr.number} "${pr.title}"`, remove: () => out("gh", ["pr", "close", String(pr.number)]) });
}
if (purgeLogs && existsSync(runDir)) items.push({ label: "logs", name: runDir, remove: () => rmSync(runDir, { recursive: true, force: true }) });

console.log(`Run ${stamp} (mode: ${m.mode === "merge" ? "--merge" : "local"})`);
for (const i of items) console.log(`  ${i.label.padEnd(13)} ${i.name}`);
if (!items.length) console.log("  nothing left to remove");
const onMain = (m.mergedCommits ?? []).filter((c: any) => merged.has(c.sha)).reverse();
if (onMain.length) {
  console.log("Merged on main (NOT touched; to undo, run yourself):");
  for (const c of onMain) console.log(`  git revert ${c.sha.slice(0, 9)}   # Case ${c.case}: ${c.title}`);
}
if (!purgeLogs && existsSync(runDir)) console.log(`Logs kept: ${runDir} (add --purge-logs to delete them)`);
if (!items.length || dryRun) process.exit(0);

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Delete these ${items.length} items? [y/N] `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") { console.log("Nothing deleted."); process.exit(0); }
}
let failures = 0;
for (const i of items) {
  try { i.remove(); console.log(`  removed ${i.label} ${i.name}`); }
  catch (e) { failures++; console.error(`  FAILED ${i.label} ${i.name}: ${(e as Error).message.split("\n")[0]}`); }
}
ok("git", ["worktree", "prune"]);
process.exit(failures ? 1 : 0);
