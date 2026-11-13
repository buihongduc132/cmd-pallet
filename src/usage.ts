/**
 * cmd-pallet — usage store
 *
 * Per-host counters, one file per host so git merges across machines never conflict:
 *   <dir>/<host>.json      → { "<host>": { "<action>": { "<YYYY-MM-DDTHH>": n } } }
 *   <dir>/<host>.cmds.json → { "<host>": { "<cmd>": { "<action>": { "<YYYY-MM-DDTHH>": n } } } }
 * Writes are serialized across processes with an owned mkdir lock (usage-lock.ts) and land atomically (tmp + rename).
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireOwnedLock, releaseOwnedLock } from "./usage-lock.ts";

/** Root of this cmd-pallet checkout (src/..). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** only for a lock whose owner cannot be proven (no owner file / no /proc); a live owner is never broken */
const LOCK_STALE_MS = 10_000;
const LOCK_RETRIES = 50;
const LOCK_RETRY_MS = 20;

type Json = { [key: string]: Json | number };

export interface RecordUsageOptions {
  dir: string;
  host: string;
  action: string;
  cmd?: string;
  now?: Date;
}

/** UTC date-hour key, e.g. `2026-11-14T08`. */
export function dateHourKey(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/**
 * Action name for one CLI invocation — mirrors dispatch precedence:
 * - `help` when `--help` is set
 * - `version` when `--version` is set (even with a verb)
 * - `help` when no verb was given
 * - the verb's own name when it is a known verb, else `unknown`
 */
export function actionOf(
  verb: string | undefined,
  flags: { help?: boolean; version?: boolean },
  known: boolean,
): string {
  if (flags.help) return "help";
  if (flags.version) return "version";
  if (verb === undefined) return "help";
  return known ? verb : "unknown";
}

/** Deep copy into null-prototype objects so keys like `__proto__` / `constructor` are plain own data keys. */
function ownKeysOnly(value: unknown): Json | number {
  if (typeof value !== "object" || value === null) return value as number;
  const out: Json = Object.create(null);
  for (const key of Object.keys(value)) out[key] = ownKeysOnly((value as Record<string, unknown>)[key]);
  return out;
}

function readStore(file: string): Json {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return Object.create(null);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return ownKeysOnly(parsed) as Json;
  } catch {
    // fall through to corrupt handling
  }
  try {
    renameSync(file, `${file}.corrupt-${Date.now()}`);
  } catch {
    // ignore — we overwrite it anyway
  }
  return Object.create(null);
}

function sortKeys(value: Json | number): Json | number {
  if (typeof value !== "object" || value === null) return value;
  const out: Json = Object.create(null);
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
  return out;
}

function writeStore(file: string, data: Json): void {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(sortKeys(data), null, 2) + "\n");
  renameSync(tmp, file);
}

/** Own-key-only walk: inherited names (`__proto__`, `constructor`, …) never resolve to Object.prototype. */
function increment(root: Json, path: string[]): void {
  let node = root;
  for (const key of path.slice(0, -1)) {
    const next = Object.hasOwn(node, key) ? node[key] : undefined;
    if (typeof next !== "object" || next === null) node[key] = Object.create(null);
    node = node[key] as Json;
  }
  const leaf = path[path.length - 1];
  const prev = Object.hasOwn(node, leaf) ? node[leaf] : undefined;
  node[leaf] = (typeof prev === "number" ? prev : 0) + 1;
}

/**
 * Default usage dir for a cmd-pallet checkout: `<repoRoot>/usage`, or undefined when repoRoot is a
 * linked git worktree (`.git` is a file) — its copy would conflict with main's on merge.
 */
export function defaultUsageDir(repoRoot: string): string | undefined {
  try {
    if (statSync(join(repoRoot, ".git")).isFile()) return undefined;
  } catch {
    // no .git → not a checkout; record in place
  }
  return resolve(repoRoot, "usage");
}

/**
 * Usage dir for this process: `CMD_PALLET_USAGE_DIR`, else `<repo>/usage` (undefined in a linked worktree).
 * Shared by recording and the `stats` verb so both look at the same files.
 */
export function resolveUsageDir(env: Record<string, string | undefined>): string | undefined {
  return env.CMD_PALLET_USAGE_DIR || defaultUsageDir(REPO_ROOT);
}

/** Increment usage counters for one invocation. Never throws; gives up silently if the lock is busy. */
export function recordUsage(opts: RecordUsageOptions): void {
  const { dir, host, action, cmd } = opts;
  const hour = dateHourKey(opts.now ?? new Date());
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  const lock = join(dir, ".lock");
  const owner = acquireOwnedLock(lock, { retries: LOCK_RETRIES, retryMs: LOCK_RETRY_MS, staleMs: LOCK_STALE_MS });
  if (owner === undefined) return;
  try {
    const actionFile = join(dir, `${host}.json`);
    const actions = readStore(actionFile);
    increment(actions, [host, action, hour]);
    writeStore(actionFile, actions);

    if (cmd !== undefined) {
      const cmdFile = join(dir, `${host}.cmds.json`);
      const cmds = readStore(cmdFile);
      increment(cmds, [host, cmd, action, hour]);
      writeStore(cmdFile, cmds);
    }
  } catch {
    // never fail the CLI over usage bookkeeping
  } finally {
    releaseOwnedLock(lock, owner);
  }
}
