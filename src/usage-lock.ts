/**
 * cmd-pallet — owned mkdir lock, shared by the usage store lock (`usage/.lock`) and the sync lock (`usage/.sync-lock`)
 *
 * Lock = directory (atomic mkdir) + `owner` file `{ pid, start, ns, nonce }`: `start` = boot id + process start time,
 * `ns` = pid namespace (`/proc/self/ns/pid`). Pids only mean something inside one pid namespace, so:
 *   - owner in OUR pid namespace → broken only when provably gone: pid not running, zombie, or running with another
 *     start identity (pid reused). Age never breaks it.
 *   - otherwise (other/unknown namespace, no owner file, no /proc start identity) → age rule: broken after staleMs.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readlinkSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  ns?: string;
  nonce: string;
}

const OWNER_FILE = "owner";

/** /proc/<pid>/stat fields from field 3 (state) on; comm may hold spaces/parens, so split after the LAST ")" */
function statFields(pid: number): string[] | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  } catch {
    return undefined;
  }
}

/** `<boot id>:<start time in clock ticks>` of a pid in this pid namespace, or undefined (no /proc, pid gone). */
export function processIdentity(pid: number): string | undefined {
  try {
    const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const start = statFields(pid)?.[19]; // starttime = field 22
    return boot && start ? `${boot}:${start}` : undefined;
  } catch {
    return undefined;
  }
}

/** this process's pid namespace, e.g. `pid:[4026531836]`, or undefined (no /proc) */
function pidNamespace(): string | undefined {
  try {
    return readlinkSync("/proc/self/ns/pid");
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
      const str = (v: unknown) => (typeof v === "string" ? v : undefined);
      return { pid: o.pid, start: str(o.start), ns: str(o.ns), nonce: o.nonce };
    }
  } catch {
    // missing / partial / corrupt → ownerless
  }
  return undefined;
}

function olderThan(lock: string, ms: number): boolean {
  return Date.now() - statSync(lock).mtimeMs > ms;
}

/** true when the lock may be broken: same-namespace owner provably gone, or ownership unprovable and older than staleMs */
function isStale(lock: string, owner: Owner | undefined, staleMs: number): boolean {
  if (!owner) return olderThan(lock, staleMs);
  const ns = pidNamespace();
  // owner's pid is meaningless here (other/unknown namespace): no ESRCH / identity shortcut, age only
  if (owner.ns === undefined || ns === undefined || owner.ns !== ns) return olderThan(lock, staleMs);
  try {
    process.kill(owner.pid, 0);
  } catch (err: any) {
    if (err?.code === "ESRCH") return true; // owner exited
    // EPERM → pid alive under another user; fall through to identity check
  }
  if (statFields(owner.pid)?.[0] === "Z") return true; // exited, not yet reaped
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
      const owner: Owner = { pid: process.pid, start: processIdentity(process.pid), ns: pidNamespace(), nonce };
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
