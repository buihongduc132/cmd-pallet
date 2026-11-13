/**
 * cmd-pallet — CLI entry point and dispatcher
 */

import { dispatch } from "./dispatch.ts";
import type { IoStreams } from "./types.ts";
import { parseArgs } from "./flags.ts";
import { getVerb } from "./verbs.ts";
import { actionOf, defaultUsageDir, recordUsage } from "./usage.ts";
import { maybeSync } from "./usage-sync.ts";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { hostname } from "node:os";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CMD_ACTIONS = new Set(["read", "get", "run"]);

/** Count one invocation in the usage store. Silent; never throws. */
export function recordInvocation(
  argv: string[],
  env: Record<string, string | undefined>,
  usage?: { cmd?: string },
): void {
  try {
    if (env.CMD_PALLET_USAGE === "0") return;
    const parsed = parseArgs(argv);
    const verb = parsed.verb?.toLowerCase();
    const known = verb !== undefined && getVerb(verb) !== undefined;
    const action = actionOf(verb, parsed.flags, known);
    const cmd = CMD_ACTIONS.has(action) ? usage?.cmd : undefined;
    // linked worktree → no default store (explicit CMD_PALLET_USAGE_DIR still records)
    const dir = env.CMD_PALLET_USAGE_DIR || defaultUsageDir(REPO_ROOT);
    if (!dir) return;
    recordUsage({ dir, host: hostname(), action, cmd });
    const rawMin = env.CMD_PALLET_USAGE_SYNC_MIN?.trim();
    const syncMin = rawMin ? Number(rawMin) : NaN;
    // invalid / unset → maybeSync default (10 min)
    const debounceMin = Number.isFinite(syncMin) && syncMin >= 0 ? syncMin : undefined;
    maybeSync({ repoDir: REPO_ROOT, usageDir: dir, debounceMin });
  } catch {
    // usage bookkeeping must never affect the CLI
  }
}

export async function runCli(
  argv: string[],
  io?: IoStreams
): Promise<number> {
  const usage: { cmd?: string } = {};
  const ioWithUsage: IoStreams = { ...io, usage };
  try {
    return await dispatch(argv, ioWithUsage);
  } finally {
    try {
      recordInvocation(argv, io?.env ?? process.env, usage);
    } catch {
      // ignore
    }
  }
}

export async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
  process.exit(exitCode);
}

// Auto-run if executed directly
if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    resolve(process.argv[1]) === fileURLToPath(import.meta.url))
) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
    process.exit(1);
  });
}
