import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { maybeSync, syncUsage } from "../src/usage-sync.ts";

const SYNC_SRC = resolve(fileURLToPath(new URL(".", import.meta.url)), "../src/usage-sync.ts");

// Isolate from the machine's global/system git config (core.hooksPath pre-push gates, templates).
beforeAll(() => {
  vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" }).trim();
}

function configure(repo: string): void {
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
}

/** bare origin with one commit on main + clones A and B tracking origin/main */
function fixture(): { root: string; remote: string; a: string; b: string } {
  const root = mkdtempSync(join(tmpdir(), "cmd-pallet-sync-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const seed = join(root, "seed");
  git(root, "init", "-q", "-b", "main", seed);
  configure(seed);
  writeFileSync(join(seed, "README.md"), "seed\n");
  writeFileSync(join(seed, ".gitignore"), "usage/.lock\nusage/*.tmp*\nusage/*.corrupt-*\nusage/.sync-*\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-q", "-u", "origin", "main");
  const a = join(root, "a");
  const b = join(root, "b");
  for (const c of [a, b]) {
    git(root, "clone", "-q", remote, c);
    configure(c);
  }
  return { root, remote, a, b };
}

function writeUsage(repo: string, host: string): void {
  mkdirSync(join(repo, "usage"), { recursive: true });
  writeFileSync(join(repo, "usage", `${host}.json`), JSON.stringify({ [host]: { list: { "2026-11-14T08": 1 } } }) + "\n");
}

function remoteTree(remote: string): string[] {
  return git(remote, "ls-tree", "-r", "--name-only", "main").split("\n").filter(Boolean);
}

function headFiles(repo: string): string[] {
  return git(repo, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
}

describe("syncUsage", () => {
  it("two clones each sync their own host file → remote has both, no conflict", () => {
    const { remote, a, b } = fixture();
    writeUsage(a, "A");
    syncUsage(a);
    writeUsage(b, "B");
    syncUsage(b);
    const tree = remoteTree(remote);
    expect(tree).toContain("usage/A.json");
    expect(tree).toContain("usage/B.json");
    expect(git(b, "status", "--porcelain", "usage/")).toBe("");
    expect(git(remote, "log", "-1", "--format=%s", "main")).toMatch(/^(chore\(usage\)|Merge)/);
  });

  it("unrelated dirty file stays dirty; unrelated staged file stays staged and out of the usage commit", () => {
    const { remote, a } = fixture();
    writeFileSync(join(a, "README.md"), "dirty\n");
    writeFileSync(join(a, "staged.txt"), "staged\n");
    git(a, "add", "staged.txt");
    writeUsage(a, "A");
    syncUsage(a);
    expect(headFiles(a)).toEqual(["usage/A.json"]);
    expect(git(a, "log", "-1", "--format=%s")).toMatch(/^chore\(usage\): \S+ \d{4}-\d\d-\d\dT/);
    expect(git(a, "diff", "--name-only")).toBe("README.md");
    expect(git(a, "diff", "--cached", "--name-only")).toBe("staged.txt");
    expect(remoteTree(remote)).toContain("usage/A.json");
    expect(remoteTree(remote)).not.toContain("staged.txt");
  });

  it("non-main branch → no commit", () => {
    const { a } = fixture();
    git(a, "checkout", "-q", "-b", "feature");
    const before = git(a, "rev-parse", "HEAD");
    writeUsage(a, "A");
    syncUsage(a);
    expect(git(a, "rev-parse", "HEAD")).toBe(before);
  });

  it("rebase in progress → no commit", () => {
    const { a } = fixture();
    mkdirSync(resolve(a, git(a, "rev-parse", "--git-path", "rebase-merge")), { recursive: true });
    const before = git(a, "rev-parse", "HEAD");
    writeUsage(a, "A");
    syncUsage(a);
    expect(git(a, "rev-parse", "HEAD")).toBe(before);
  });

  it("local non-usage commit ahead → usage committed locally, NOT pushed", () => {
    const { remote, a } = fixture();
    const remoteBefore = git(remote, "rev-parse", "main");
    writeFileSync(join(a, "other.txt"), "x\n");
    git(a, "add", "other.txt");
    git(a, "commit", "-q", "-m", "other work");
    writeUsage(a, "A");
    syncUsage(a);
    expect(headFiles(a)).toEqual(["usage/A.json"]);
    expect(git(remote, "rev-parse", "main")).toBe(remoteBefore);
  });

  it("stale .sync-lock (10 min) is broken → sync runs", () => {
    const { remote, a } = fixture();
    writeUsage(a, "A");
    const lock = join(a, "usage", ".sync-lock");
    mkdirSync(lock);
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(lock, old, old);
    syncUsage(a);
    expect(remoteTree(remote)).toContain("usage/A.json");
    expect(existsSync(lock)).toBe(false);
  });

  it("fresh .sync-lock → skipped", () => {
    const { remote, a } = fixture();
    writeUsage(a, "A");
    const lock = join(a, "usage", ".sync-lock");
    mkdirSync(lock);
    const before = git(a, "rev-parse", "HEAD");
    syncUsage(a);
    expect(git(a, "rev-parse", "HEAD")).toBe(before);
    expect(remoteTree(remote)).not.toContain("usage/A.json");
    expect(existsSync(lock)).toBe(true);
  });

  it("worker entry runs for real via node → remote has the commit", () => {
    const { remote, a } = fixture();
    writeUsage(a, "A");
    execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", SYNC_SRC, a], {
      stdio: "pipe",
      timeout: 60_000,
    });
    expect(remoteTree(remote)).toContain("usage/A.json");
    expect(existsSync(join(a, "usage", ".sync-log"))).toBe(true);
  });
});

/** B pushes a usage commit so A is behind origin/main by one commit. */
function pushFromB(b: string): void {
  writeUsage(b, "B");
  syncUsage(b);
}

/** Start a REAL conflicting merge in repo (add/add conflict on README.md); returns the MERGE_HEAD sha. */
function startForeignConflictMerge(repo: string): string {
  const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: "side\n", encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["mktree"], { cwd: repo, input: `100644 blob ${blob}\tREADME.md\n`, encoding: "utf8" }).trim();
  const side = git(repo, "commit-tree", tree, "-m", "side");
  expect(() => git(repo, "merge", "--allow-unrelated-histories", "--no-edit", side)).toThrow();
  return side;
}

function mergeHeadPath(repo: string): string {
  return resolve(repo, git(repo, "rev-parse", "--git-path", "MERGE_HEAD"));
}

describe("syncUsage merge safety (B1)", () => {
  it("foreign merge starts between fetch and merge → skip, no merge, no abort, their state intact", () => {
    const { a, b } = fixture();
    pushFromB(b);
    writeUsage(a, "A");
    let side = "";
    const outcome = syncUsage(a, { beforeMerge: () => (side = startForeignConflictMerge(a)) });
    expect(side).not.toBe("");
    expect(outcome).toMatch(/^skip: MERGE_HEAD in progress/);
    expect(existsSync(mergeHeadPath(a))).toBe(true);
    expect(readFileSync(mergeHeadPath(a), "utf8").trim()).toBe(side);
    expect(git(a, "ls-files", "-u")).toContain("README.md");
    expect(readFileSync(join(a, "README.md"), "utf8")).toContain("<<<<<<<");
    // our merge never ran: origin's usage/B.json not merged in
    expect(existsSync(join(a, "usage", "B.json"))).toBe(false);
  });

  it("branch switched between fetch and merge → skip, nothing merged into it", () => {
    const { a, b } = fixture();
    pushFromB(b);
    writeUsage(a, "A");
    const outcome = syncUsage(a, { beforeMerge: () => git(a, "checkout", "-q", "-b", "feature") });
    expect(outcome).toBe("skip: branch feature");
    expect(existsSync(join(a, "usage", "B.json"))).toBe(false);
  });

  it("our merge refused (dirty file origin changed) → stop, dirty file + tree intact, no MERGE_HEAD", () => {
    const { a, b } = fixture();
    writeFileSync(join(b, "README.md"), "from-b\n");
    git(b, "commit", "-q", "-am", "b edits readme");
    git(b, "push", "-q", "origin", "main");
    writeFileSync(join(a, "README.md"), "dirty-a\n");
    writeUsage(a, "A");
    const outcome = syncUsage(a);
    expect(outcome).toBe("stop: merge failed");
    expect(readFileSync(join(a, "README.md"), "utf8")).toBe("dirty-a\n");
    expect(git(a, "diff", "--name-only")).toBe("README.md");
    expect(existsSync(mergeHeadPath(a))).toBe(false);
    expect(git(a, "log", "-1", "--format=%s")).toMatch(/^chore\(usage\)/);
  });

  it("our own merge conflicts (MERGE_HEAD == @{u}) → aborted, clean tree", () => {
    const { a, b } = fixture();
    // both clones write the SAME host file → our merge conflicts on usage/X.json
    writeUsage(b, "X");
    writeFileSync(join(b, "usage", "X.json"), JSON.stringify({ X: { list: { "2026-11-14T09": 5 } } }) + "\n");
    syncUsage(b);
    writeUsage(a, "X");
    const outcome = syncUsage(a);
    expect(outcome).toBe("stop: merge failed");
    expect(existsSync(mergeHeadPath(a))).toBe(false);
    expect(git(a, "ls-files", "-u")).toBe("");
    expect(git(a, "status", "--porcelain", "--untracked-files=no")).toBe("");
  });
});

describe("maybeSync", () => {
  function fakeRepo(): string {
    const root = mkdtempSync(join(tmpdir(), "cmd-pallet-maybe-"));
    roots.push(root);
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "usage"));
    return root;
  }
  function spawnMock() {
    const unref = vi.fn();
    const spawnImpl = vi.fn(() => ({ unref }));
    return { spawnImpl, unref };
  }

  it("debounce 0 → spawns node + src/usage-sync.ts + repoDir detached, unref'd", () => {
    const repo = fakeRepo();
    const { spawnImpl, unref } = spawnMock();
    maybeSync({ repoDir: repo, usageDir: join(repo, "usage"), debounceMin: 0, spawnImpl: spawnImpl as any });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnImpl.mock.calls[0] as any[];
    expect(cmd).toBe(process.execPath);
    expect(args).toEqual(["--experimental-strip-types", "--no-warnings=ExperimentalWarning", SYNC_SRC, repo]);
    expect(opts).toMatchObject({ detached: true, stdio: "ignore" });
    expect(unref).toHaveBeenCalledTimes(1);
    expect(existsSync(join(repo, "usage", ".sync-stamp"))).toBe(true);
  });

  it("within debounce window → not spawned", () => {
    const repo = fakeRepo();
    const { spawnImpl } = spawnMock();
    const now = new Date();
    maybeSync({ repoDir: repo, usageDir: join(repo, "usage"), debounceMin: 10, now, spawnImpl: spawnImpl as any });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    maybeSync({
      repoDir: repo,
      usageDir: join(repo, "usage"),
      debounceMin: 10,
      now: new Date(now.getTime() + 5 * 60_000),
      spawnImpl: spawnImpl as any,
    });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    maybeSync({
      repoDir: repo,
      usageDir: join(repo, "usage"),
      debounceMin: 10,
      now: new Date(now.getTime() + 11 * 60_000),
      spawnImpl: spawnImpl as any,
    });
    expect(spawnImpl).toHaveBeenCalledTimes(2);
    expect(statSync(join(repo, "usage", ".sync-stamp")).mtimeMs).toBeGreaterThan(now.getTime());
  });

  it("usageDir outside <repoDir>/usage → not spawned", () => {
    const repo = fakeRepo();
    const other = mkdtempSync(join(tmpdir(), "cmd-pallet-other-"));
    roots.push(other);
    const { spawnImpl } = spawnMock();
    maybeSync({ repoDir: repo, usageDir: other, debounceMin: 0, spawnImpl: spawnImpl as any });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("not a git repo → not spawned", () => {
    const root = mkdtempSync(join(tmpdir(), "cmd-pallet-nogit-"));
    roots.push(root);
    mkdirSync(join(root, "usage"));
    const { spawnImpl } = spawnMock();
    maybeSync({ repoDir: root, usageDir: join(root, "usage"), debounceMin: 0, spawnImpl: spawnImpl as any });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("never throws when spawn throws", () => {
    const repo = fakeRepo();
    const spawnImpl = vi.fn(() => {
      throw new Error("boom");
    });
    expect(() =>
      maybeSync({ repoDir: repo, usageDir: join(repo, "usage"), debounceMin: 0, spawnImpl: spawnImpl as any }),
    ).not.toThrow();
  });
});
