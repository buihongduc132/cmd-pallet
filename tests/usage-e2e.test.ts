/**
 * Usage end-to-end check: the real bin/cmd-pallet.js records an invocation, its detached sync worker
 * commits + pushes, and the key reaches the remote exactly once.
 *
 * Fixture: temp bare remote whose `main` holds a copy of this checkout's bin/ + src/, plus clones of it.
 * Each clone is a "main checkout" of cmd-pallet, so the CLI's default usage dir is <clone>/usage and its
 * sync worker targets the clone — never this worktree or the real store.
 */
import { execFile, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_ROOT } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOST = hostname();

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** git isolated from the machine's global/system config (pre-push gates, hooksPath, templates) */
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8", env: { ...process.env, ...GIT_ENV } }).trim();
}

function configure(repo: string): void {
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
}

/** bare origin whose main = copy of this cmd-pallet (bin/, src/, package.json) + one clone per name (node_modules linked) */
function fixture(...names: string[]): { root: string; remote: string; clones: string[] } {
  const root = mkdtempSync(join(tmpdir(), "cmd-pallet-e2e-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const seed = join(root, "seed");
  git(root, "init", "-q", "-b", "main", seed);
  configure(seed);
  for (const p of ["bin/cmd-pallet.js", "src", "package.json"]) cpSync(join(ROOT, p), join(seed, p), { recursive: true });
  writeFileSync(join(seed, ".gitignore"), "node_modules\nusage/.lock\nusage/*.tmp*\nusage/*.corrupt-*\nusage/.sync-*\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-q", "-u", "origin", "main");
  const clones = names.map((n) => {
    const c = join(root, n);
    git(root, "clone", "-q", remote, c);
    configure(c);
    symlinkSync(join(ROOT, "node_modules"), join(c, "node_modules")); // src/catalog.ts loads `typescript`
    return c;
  });
  return { root, remote, clones };
}

// ── the E2E check ────────────────────────────────────────────────────────────

/** Run key: a name no catalog has (→ `read K` records K as typed); random part → unique even for the same T0. */
function e2eKey(t0: number): string {
  return `e2e-${t0}-${randomBytes(6).toString("hex")}`;
}

/** Env for the E2E invocation: parent env, but recording forced ON (parent may carry CMD_PALLET_USAGE=0) + sync now. */
function e2eEnv(parent: Record<string, string | undefined>, home: string): Record<string, string | undefined> {
  return {
    ...parent,
    ...GIT_ENV,
    HOME: home,
    PI_CODING_AGENT_DIR: FIXTURE_ROOT,
    CMD_PALLET_CACHE_TTL: "0",
    CMD_PALLET_USAGE: "1",
    CMD_PALLET_USAGE_DIR: "",
    CMD_PALLET_USAGE_SYNC_MIN: "0",
  };
}

/** remote count of `[HOST][K].read`, summed over hours (0 when absent) */
function remoteReadCount(remote: string, key: string): number {
  let raw: string;
  try {
    raw = git(remote, "show", `main:usage/${HOST}.cmds.json`);
  } catch {
    return 0;
  }
  const hours: Record<string, number> = JSON.parse(raw)[HOST]?.[key]?.read ?? {};
  return Object.values(hours).reduce((a, b) => a + b, 0);
}

function localReadCount(repo: string, key: string): number {
  const file = join(repo, "usage", `${HOST}.cmds.json`);
  if (!existsSync(file)) return 0;
  const hours: Record<string, number> = JSON.parse(readFileSync(file, "utf8"))[HOST]?.[key]?.read ?? {};
  return Object.values(hours).reduce((a, b) => a + b, 0);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * One E2E run in `repo`: `cmd-pallet read K` via the real bin, then wait for K on the remote.
 * `kick`: when the detached worker skipped (sync lock held by a sibling run), run the worker again.
 */
async function runE2E(
  repo: string,
  remote: string,
  opts: { t0: number; parentEnv: Record<string, string | undefined>; kick?: boolean },
): Promise<{ key: string; local: number; remote: number }> {
  const key = e2eKey(opts.t0);
  const env = e2eEnv(opts.parentEnv, join(repo, ".."));
  await execFileAsync(process.execPath, [join(repo, "bin", "cmd-pallet.js"), "read", key], { cwd: FIXTURE_ROOT, env }).catch(
    () => undefined, // not found → non-zero exit is expected
  );
  const local = localReadCount(repo, key);
  const deadline = Date.now() + 30_000;
  while (local > 0 && remoteReadCount(remote, key) === 0 && Date.now() < deadline) {
    await sleep(200);
    if (opts.kick) {
      await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", join(repo, "src", "usage-sync.ts"), repo],
        { env },
      ).catch(() => undefined);
    }
  }
  // let the detached worker finish (lock released + log line) so cleanup cannot race its last write
  while (existsSync(join(repo, "usage", ".sync-lock")) && Date.now() < deadline) await sleep(100);
  await sleep(200);
  return { key, local, remote: remoteReadCount(remote, key) };
}

describe("usage E2E: real bin → record → detached sync → remote", () => {
  it("parent env CMD_PALLET_USAGE=0 → the E2E invocation still records K and K reaches the remote (cpal-qp8.7)", async () => {
    const { remote, clones } = fixture("a");
    const [a] = clones;
    const parentEnv = { ...process.env, CMD_PALLET_USAGE: "0" };
    expect(process.env.CMD_PALLET_USAGE).toBe("0"); // vitest.config sets it for the whole suite
    const r = await runE2E(a, remote, { t0: Date.now(), parentEnv });
    expect(r.local).toBe(1);
    expect(r.remote).toBe(1);
    const subjects = git(remote, "log", "main", "--format=%s", "-S", `"${r.key}"`, "--", `usage/${HOST}.cmds.json`);
    expect(subjects).toMatch(new RegExp(`^chore\\(usage\\): ${HOST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d{4}-`, "m"));
  }, 60_000);

  it("two runs sharing T0 get distinct keys (cpal-qp8.8)", () => {
    const t0 = Date.now();
    expect(e2eKey(t0)).not.toBe(e2eKey(t0));
    expect(e2eKey(t0)).toMatch(new RegExp(`^e2e-${t0}-[0-9a-f]{8,}$`));
  });

  it("two simultaneous runs with the same T0 → each key reaches the remote exactly once (cpal-qp8.8)", async () => {
    const { remote, clones } = fixture("a");
    const [a] = clones;
    const t0 = Date.now();
    const parentEnv = { ...process.env, CMD_PALLET_USAGE: "0" };
    const [r1, r2] = await Promise.all([
      runE2E(a, remote, { t0, parentEnv, kick: true }),
      runE2E(a, remote, { t0, parentEnv, kick: true }),
    ]);
    expect(r1.key).not.toBe(r2.key);
    expect(r1.remote).toBe(1);
    expect(r2.remote).toBe(1);
  }, 90_000);
});
