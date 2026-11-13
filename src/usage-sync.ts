/**
 * cmd-pallet — background git sync of the usage store
 *
 * maybeSync: hot-path check (no git subprocess) → debounced detached worker spawn.
 * syncUsage: worker body — commit ONLY usage/*.json on main, merge origin/main, push.
 *   Guards re-run right before the merge; `merge --abort` only ever undoes the merge this worker started.
 *   Any guard or git failure stops quietly; outcome is appended to usage/.sync-log (gitignored).
 * Worker entry: `node --experimental-strip-types src/usage-sync.ts <repoDir>`.
 */

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireOwnedLock, releaseOwnedLock } from "./usage-lock.ts";

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_DEBOUNCE_MIN = 10;
/** only for a lock whose owner cannot be proven (no owner file / no /proc); a live owner is never broken */
const SYNC_LOCK_STALE_MS = 5 * 60_000;
const GIT_TIMEOUT_MS = 60_000;
const MAX_PUSH_ATTEMPTS = 3;
const IN_PROGRESS = ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "BISECT_LOG"];

type SpawnLike = (cmd: string, args: string[], opts: { detached: boolean; stdio: "ignore" }) => { unref(): void };

export interface MaybeSyncOptions {
  repoDir: string;
  usageDir: string;
  now?: Date;
  debounceMin?: number;
  spawnImpl?: SpawnLike;
}

/** Spawn a detached sync worker when usage lives in this repo's git checkout and the debounce elapsed. Never throws. */
export function maybeSync(opts: MaybeSyncOptions): void {
  try {
    const { repoDir, usageDir } = opts;
    if (resolve(usageDir) !== resolve(repoDir, "usage")) return;
    if (!existsSync(join(repoDir, ".git"))) return;

    const now = opts.now ?? new Date();
    const debounceMs = (opts.debounceMin ?? DEFAULT_DEBOUNCE_MIN) * 60_000;
    const stamp = join(usageDir, ".sync-stamp");
    if (debounceMs > 0) {
      try {
        if (now.getTime() - statSync(stamp).mtimeMs < debounceMs) return;
      } catch {
        // no stamp yet → sync now
      }
    }
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(stamp, "");
    utimesSync(stamp, now, now);

    const spawnImpl: SpawnLike = opts.spawnImpl ?? (spawn as unknown as SpawnLike);
    const child = spawnImpl(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", SELF, repoDir],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  } catch {
    // usage sync must never affect the CLI
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" },
  }).trim();
}

/** true when the git call exits 0 */
function gitOk(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

function gitPath(repoDir: string, name: string): string {
  return resolve(repoDir, git(repoDir, ["rev-parse", "--git-path", name]));
}

function readMergeHead(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8").split("\n")[0].trim();
  } catch {
    return undefined;
  }
}

/** `skip: ...` when a merge/rebase/cherry-pick/bisect is in progress, HEAD is detached or not on main; else undefined. */
function checkoutBusy(repoDir: string): string | undefined {
  for (const name of IN_PROGRESS) {
    if (existsSync(gitPath(repoDir, name))) return `skip: ${name} in progress`;
  }
  if (!gitOk(repoDir, ["symbolic-ref", "-q", "HEAD"])) return "skip: detached HEAD";
  const branch = git(repoDir, ["symbolic-ref", "--short", "HEAD"]);
  if (branch !== "main") return `skip: branch ${branch}`;
  return undefined;
}

interface SyncHooks {
  beforeMerge?: () => void;
  beforePush?: () => void;
}

/** Steps 0–5; steps 3–5 retry when another host pushed first. Throws on git failure (caller logs it). */
function runSync(repoDir: string, now: Date, hooks: SyncHooks = {}): string {
  // 0. guards
  const busy = checkoutBusy(repoDir);
  if (busy) return busy;
  let upstream: string;
  try {
    upstream = git(repoDir, ["rev-parse", "--abbrev-ref", "main@{u}"]);
  } catch {
    return "skip: main has no upstream";
  }
  if (upstream !== "origin/main") return `skip: upstream ${upstream}`;

  // 1–2. commit usage/*.json only
  let committed = false;
  const hasJson = readdirSync(join(repoDir, "usage")).some((f) => f.endsWith(".json"));
  if (hasJson) {
    git(repoDir, ["add", "--", "usage/*.json"]);
    if (!gitOk(repoDir, ["diff", "--cached", "--quiet", "--", "usage/"])) {
      git(repoDir, ["commit", "-m", `chore(usage): ${hostname()} ${now.toISOString()}`, "--", "usage/"]);
      committed = true;
    }
  }

  // 3–5. fetch → merge → push; a rejected push (another host pushed first) loops back to fetch
  for (let attempt = 1; ; attempt++) {
    const step = fetchMergePush(repoDir, committed, hooks);
    if (step !== "retry") return step;
    if (attempt >= MAX_PUSH_ATTEMPTS) return "stop: push failed";
  }
}

/** One fetch → merge → push round. "retry" = push rejected; anything else is the final outcome. */
function fetchMergePush(repoDir: string, committed: boolean, hooks: SyncHooks): string {
  // 3. fetch; never push someone else's unpushed non-usage work
  git(repoDir, ["fetch", "origin"]);
  const aheadPaths = git(repoDir, ["log", "@{u}..HEAD", "--format=", "--name-only"])
    .split("\n")
    .filter(Boolean);
  const foreign = aheadPaths.find((p) => !p.startsWith("usage/"));
  if (foreign !== undefined) {
    return `stop: unpushed non-usage commit (${foreign})${committed ? ", usage committed locally" : ""}`;
  }

  // 4. merge upstream when behind
  if (Number(git(repoDir, ["rev-list", "--count", "HEAD..@{u}"])) > 0) {
    hooks.beforeMerge?.();
    // the checkout is shared: someone may have started a merge/rebase or switched branch since step 0
    const busyNow = checkoutBusy(repoDir);
    if (busyNow) return busyNow;
    const target = git(repoDir, ["rev-parse", "@{u}"]);
    const mergeHead = gitPath(repoDir, "MERGE_HEAD");
    const hadMergeHead = existsSync(mergeHead);
    // merge the pinned sha (not `@{u}`) so a concurrent fetch cannot change what MERGE_HEAD is compared to
    if (!gitOk(repoDir, ["merge", "--no-edit", "-m", "Merge remote-tracking branch 'origin/main'", target])) {
      // abort ONLY the merge we started: MERGE_HEAD is new and points at the upstream sha we merged
      if (!hadMergeHead && readMergeHead(mergeHead) === target) gitOk(repoDir, ["merge", "--abort"]);
      return "stop: merge failed";
    }
  }

  // 5. push
  if (Number(git(repoDir, ["rev-list", "--count", "@{u}..HEAD"])) === 0) return "ok: nothing to push";
  hooks.beforePush?.();
  if (!gitOk(repoDir, ["push", "origin", "main"])) return "retry";
  return committed ? "ok: committed + pushed" : "ok: pushed";
}

/** Commit + push usage/ in repoDir. Synchronous, never throws; returns the outcome line it logged. */
export function syncUsage(repoDir: string, opts?: { now?: Date } & SyncHooks): string {
  const now = opts?.now ?? new Date();
  const usageDir = join(repoDir, "usage");
  try {
    mkdirSync(usageDir, { recursive: true });
  } catch {
    return "skip: no usage dir";
  }
  let outcome: string;
  const lock = join(usageDir, ".sync-lock");
  const owner = acquireOwnedLock(lock, { retries: 2, retryMs: 0, staleMs: SYNC_LOCK_STALE_MS });
  if (owner === undefined) {
    outcome = "skip: sync locked";
  } else {
    try {
      outcome = runSync(repoDir, now, { beforeMerge: opts?.beforeMerge, beforePush: opts?.beforePush });
    } catch (err: any) {
      const first = String(err?.stderr || err?.message || err).trim().split("\n")[0];
      outcome = `stop: git failed (${first})`;
    } finally {
      releaseOwnedLock(lock, owner);
    }
  }
  // 6. log
  try {
    appendFileSync(join(usageDir, ".sync-log"), `${now.toISOString()} ${outcome}\n`);
  } catch {
    // ignore
  }
  return outcome;
}

// Worker entry
if (
  process.argv[1] &&
  process.argv[2] &&
  (import.meta.url === `file://${process.argv[1]}` || resolve(process.argv[1]) === SELF)
) {
  syncUsage(process.argv[2]);
}
