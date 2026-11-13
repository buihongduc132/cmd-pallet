/**
 * cmd-pallet — background git sync of the usage store
 *
 * maybeSync: hot-path check (no git subprocess) → debounced detached worker spawn.
 * syncUsage: worker body — commit ONLY usage/*.json on main, merge origin/main, push.
 *   Any guard or git failure stops quietly; outcome is appended to usage/.sync-log (gitignored).
 * Worker entry: `node --experimental-strip-types src/usage-sync.ts <repoDir>`.
 */

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_DEBOUNCE_MIN = 10;
const SYNC_LOCK_STALE_MS = 5 * 60_000;
const GIT_TIMEOUT_MS = 60_000;
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

function acquireSyncLock(lock: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(lock);
      return true;
    } catch (err: any) {
      if (err?.code !== "EEXIST") return false;
      try {
        if (Date.now() - statSync(lock).mtimeMs <= SYNC_LOCK_STALE_MS) return false;
        rmdirSync(lock);
      } catch {
        // vanished meanwhile → retry
      }
    }
  }
  return false;
}

/** Steps 0–5; returns the outcome line. Throws on git failure (caller logs it). */
function runSync(repoDir: string, now: Date): string {
  // 0. guards
  for (const name of IN_PROGRESS) {
    if (existsSync(resolve(repoDir, git(repoDir, ["rev-parse", "--git-path", name])))) return `skip: ${name} in progress`;
  }
  if (!gitOk(repoDir, ["symbolic-ref", "-q", "HEAD"])) return "skip: detached HEAD";
  const branch = git(repoDir, ["symbolic-ref", "--short", "HEAD"]);
  if (branch !== "main") return `skip: branch ${branch}`;
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
    if (!gitOk(repoDir, ["merge", "--no-edit", "@{u}"])) {
      gitOk(repoDir, ["merge", "--abort"]);
      return "stop: merge failed";
    }
  }

  // 5. push
  if (Number(git(repoDir, ["rev-list", "--count", "@{u}..HEAD"])) === 0) return "ok: nothing to push";
  if (!gitOk(repoDir, ["push", "origin", "main"])) return "stop: push failed";
  return committed ? "ok: committed + pushed" : "ok: pushed";
}

/** Commit + push usage/ in repoDir. Synchronous, never throws; returns the outcome line it logged. */
export function syncUsage(repoDir: string, opts?: { now?: Date }): string {
  const now = opts?.now ?? new Date();
  const usageDir = join(repoDir, "usage");
  try {
    mkdirSync(usageDir, { recursive: true });
  } catch {
    return "skip: no usage dir";
  }
  let outcome: string;
  const lock = join(usageDir, ".sync-lock");
  if (!acquireSyncLock(lock)) {
    outcome = "skip: sync locked";
  } else {
    try {
      outcome = runSync(repoDir, now);
    } catch (err: any) {
      const first = String(err?.stderr || err?.message || err).trim().split("\n")[0];
      outcome = `stop: git failed (${first})`;
    } finally {
      try {
        rmdirSync(lock);
      } catch {
        // ignore
      }
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
