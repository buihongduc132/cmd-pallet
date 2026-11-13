/**
 * cmd-pallet — owned mkdir lock, shared by the usage store lock (`usage/.lock`) and the sync lock (`usage/.sync-lock`)
 *
 * Lock = directory (atomic mkdir) + `owner` file `{ pid, start, nonce }`, where `start` = boot id + process start
 * time from /proc. A held lock is broken only when its owner is provably gone:
 *   - its pid is not running, or
 *   - its pid is running but with a different start identity → the pid was reused by an unrelated process.
 * A live owner is never broken by age. Bounded fallbacks (age > staleMs) only where ownership cannot be proven:
 *   - no/unreadable owner file (crash between mkdir and write, or a lock left by an older cmd-pallet), or
 *   - no process start identity available (no /proc).
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface OwnedLockOptions {
  /** mkdir attempts before giving up */
  retries: number;
  /** wait between attempts while the lock is held by a live owner */
  retryMs: number;
  /** age after which a lock whose ownership cannot be proven is broken */
  staleMs: number;
}

interface Owner {
  pid: number;
  start?: string;
  nonce: string;
}

const OWNER_FILE = "owner";

/** `<boot id>:<start time in clock ticks>` of a running pid, or undefined (no /proc, pid gone). */
export function processIdentity(pid: number): string | undefined {
  try {
    const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // fields after "pid (comm) " — comm may hold spaces/parens, so split after the LAST ")"; starttime = field 22
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    return boot && start ? `${boot}:${start}` : undefined;
  } catch {
    return undefined;
  }
}

function sleepSync(ms: number): void {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readOwner(lock: string): Owner | undefined {
  try {
    const o = JSON.parse(readFileSync(join(lock, OWNER_FILE), "utf8"));
    if (Number.isSafeInteger(o?.pid) && o.pid > 0 && typeof o.nonce === "string") {
      return { pid: o.pid, start: typeof o.start === "string" ? o.start : undefined, nonce: o.nonce };
    }
  } catch {
    // missing / partial / corrupt → ownerless
  }
  return undefined;
}

function olderThan(lock: string, ms: number): boolean {
  return Date.now() - statSync(lock).mtimeMs > ms;
}

/** true when the lock may be broken: owner provably gone, or ownership unprovable and older than staleMs */
function isStale(lock: string, owner: Owner | undefined, staleMs: number): boolean {
  if (!owner) return olderThan(lock, staleMs);
  try {
    process.kill(owner.pid, 0);
  } catch (err: any) {
    if (err?.code === "ESRCH") return true; // owner exited
    // EPERM → pid alive under another user; fall through to identity check
  }
  const current = processIdentity(owner.pid);
  if (owner.start !== undefined && current !== undefined) return current !== owner.start; // reused pid ≠ owner
  return olderThan(lock, staleMs);
}

function removeLock(lock: string): void {
  rmSync(join(lock, OWNER_FILE), { force: true });
  rmdirSync(lock);
}

/** Acquire `lock`; returns the owner nonce (pass it to releaseOwnedLock), or undefined when it stays held. */
export function acquireOwnedLock(lock: string, opts: OwnedLockOptions): string | undefined {
  const nonce = randomBytes(8).toString("hex");
  for (let attempt = 0; attempt < opts.retries; attempt++) {
    try {
      mkdirSync(lock);
    } catch (err: any) {
      if (err?.code !== "EEXIST") return undefined;
      try {
        const owner = readOwner(lock);
        if (isStale(lock, owner, opts.staleMs)) {
          // re-read right before removing: never remove a lock someone else re-acquired meanwhile
          if (readOwner(lock)?.nonce === owner?.nonce) removeLock(lock);
          continue;
        }
      } catch {
        // lock vanished or changed meanwhile → retry
        continue;
      }
      if (attempt < opts.retries - 1) sleepSync(opts.retryMs);
      continue;
    }
    try {
      const owner: Owner = { pid: process.pid, start: processIdentity(process.pid), nonce };
      writeFileSync(join(lock, OWNER_FILE), JSON.stringify(owner));
    } catch {
      // ownerless lock still excludes others; it is only broken by age
    }
    return nonce;
  }
  return undefined;
}

/** Release a lock acquired with `nonce`; leaves it alone when another owner holds it now. Never throws. */
export function releaseOwnedLock(lock: string, nonce: string): void {
  try {
    const owner = readOwner(lock);
    if (owner && owner.nonce !== nonce) return;
    removeLock(lock);
  } catch {
    // ignore
  }
}
