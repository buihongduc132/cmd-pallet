/**
 * cmd-pallet — usage store
 *
 * Per-host counters, one file per host so git merges across machines never conflict:
 *   <dir>/<host>.json      → { "<host>": { "<action>": { "<YYYY-MM-DDTHH>": n } } }
 *   <dir>/<host>.cmds.json → { "<host>": { "<cmd>": { "<action>": { "<YYYY-MM-DDTHH>": n } } } }
 * Writes are serialized across processes with a mkdir lock and land atomically (tmp + rename).
 */

import { mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(lock: string): boolean {
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      mkdirSync(lock);
      return true;
    } catch (err: any) {
      if (err?.code !== "EEXIST") return false;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmdirSync(lock);
          continue;
        }
      } catch {
        // lock vanished between mkdir and stat — retry immediately
        continue;
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
  return false;
}

function readStore(file: string): Json {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Json;
  } catch {
    // fall through to corrupt handling
  }
  try {
    renameSync(file, `${file}.corrupt-${Date.now()}`);
  } catch {
    // ignore — we overwrite it anyway
  }
  return {};
}

function sortKeys(value: Json | number): Json | number {
  if (typeof value !== "object" || value === null) return value;
  const out: Json = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
  return out;
}

function writeStore(file: string, data: Json): void {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(sortKeys(data), null, 2) + "\n");
  renameSync(tmp, file);
}

function increment(root: Json, path: string[]): void {
  let node = root;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== "object" || next === null) node[key] = {};
    node = node[key] as Json;
  }
  const leaf = path[path.length - 1];
  const prev = node[leaf];
  node[leaf] = (typeof prev === "number" ? prev : 0) + 1;
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
  if (!acquireLock(lock)) return;
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
    try {
      rmdirSync(lock);
    } catch {
      // ignore
    }
  }
}
