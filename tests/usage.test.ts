import { describe, it, expect } from "vitest";
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { actionOf, dateHourKey, defaultUsageDir, recordUsage } from "../src/usage.ts";
import { acquireOwnedLock, processIdentity, releaseOwnedLock } from "../src/usage-lock.ts";
import { withTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const SELF_NS = readlinkSync("/proc/self/ns/pid");
const LOCK_SRC_URL = pathToFileURL(resolve(fileURLToPath(new URL(".", import.meta.url)), "../src/usage-lock.ts")).href;
const HAS_UNSHARE = spawnSync("unshare", ["-Urpf", "--mount-proc", "true"]).status === 0;
const USAGE_SRC = resolve(fileURLToPath(new URL(".", import.meta.url)), "../src/usage.ts");

const H8 = new Date(Date.UTC(2026, 10, 14, 8, 30, 0));
const H9 = new Date(Date.UTC(2026, 10, 14, 9, 5, 0));

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("usage store", () => {
  describe("dateHourKey", () => {
    it("formats UTC YYYY-MM-DDTHH with zero padding", () => {
      expect(dateHourKey(H8)).toBe("2026-11-14T08");
      expect(dateHourKey(new Date(Date.UTC(2026, 0, 3, 0, 59, 59)))).toBe("2026-01-03T00");
    });

    it("uses UTC, not local time", () => {
      // 23:30 UTC on Dec 31 stays Dec 31 regardless of local TZ offset
      expect(dateHourKey(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31T23");
      expect(dateHourKey(new Date("2026-06-01T05:00:00+07:00"))).toBe("2026-05-31T22");
    });
  });

  describe("actionOf", () => {
    it("returns the verb name when known", () => {
      expect(actionOf("read", {}, true)).toBe("read");
    });

    it("returns version for --version even with a verb (mirrors dispatch precedence)", () => {
      expect(actionOf("list", { version: true }, true)).toBe("version");
      expect(actionOf("bogus", { version: true }, false)).toBe("version");
    });

    it("returns help for --help or no verb", () => {
      expect(actionOf(undefined, {}, false)).toBe("help");
      expect(actionOf("read", { help: true }, true)).toBe("help");
      expect(actionOf(undefined, { help: true, version: true }, false)).toBe("help");
    });

    it("returns version for --version without help", () => {
      expect(actionOf(undefined, { version: true }, false)).toBe("version");
    });

    it("returns unknown for an unknown verb", () => {
      expect(actionOf("bogus", {}, false)).toBe("unknown");
    });
  });

  describe("recordUsage", () => {
    it("creates the dir and records the first increment", () =>
      withTempDir((tmp) => {
        const dir = join(tmp, "usage");
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(readJson(join(dir, "h1.json"))).toEqual({ h1: { list: { "2026-11-14T08": 1 } } });
      }));

    it("increments the same hour to 2", () =>
      withTempDir((dir) => {
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(readJson(join(dir, "h1.json")).h1.list["2026-11-14T08"]).toBe(2);
      }));

    it("adds a new key for a different hour", () =>
      withTempDir((dir) => {
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        recordUsage({ dir, host: "h1", action: "list", now: H9 });
        expect(readJson(join(dir, "h1.json"))).toEqual({
          h1: { list: { "2026-11-14T08": 1, "2026-11-14T09": 1 } },
        });
      }));

    it("writes sorted keys, 2-space indent, trailing newline", () =>
      withTempDir((dir) => {
        recordUsage({ dir, host: "h1", action: "search", now: H9 });
        recordUsage({ dir, host: "h1", action: "list", now: H9 });
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        const raw = readFileSync(join(dir, "h1.json"), "utf8");
        expect(raw).toBe(
          '{\n  "h1": {\n    "list": {\n      "2026-11-14T08": 1,\n      "2026-11-14T09": 1\n    },\n    "search": {\n      "2026-11-14T09": 1\n    }\n  }\n}\n',
        );
        // no tmp files left behind
        expect(readdirSync(dir).sort()).toEqual(["h1.json"]);
      }));

    it("does not write the cmds file without cmd", () =>
      withTempDir((dir) => {
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(existsSync(join(dir, "h1.cmds.json"))).toBe(false);
      }));

    it("writes the cmds file when cmd is given", () =>
      withTempDir((dir) => {
        recordUsage({ dir, host: "h1", action: "read", cmd: "spb-plan", now: H8 });
        recordUsage({ dir, host: "h1", action: "read", cmd: "spb-plan", now: H8 });
        expect(readJson(join(dir, "h1.json"))).toEqual({ h1: { read: { "2026-11-14T08": 2 } } });
        expect(readJson(join(dir, "h1.cmds.json"))).toEqual({
          h1: { "spb-plan": { read: { "2026-11-14T08": 2 } } },
        });
      }));

    it("recovers from a corrupt file: renames it and starts fresh", () =>
      withTempDir((dir) => {
        writeFileSync(join(dir, "h1.json"), "{not json");
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(readJson(join(dir, "h1.json"))).toEqual({ h1: { list: { "2026-11-14T08": 1 } } });
        const corrupt = readdirSync(dir).filter((f) => /^h1\.json\.corrupt-\d+$/.test(f));
        expect(corrupt).toHaveLength(1);
        expect(readFileSync(join(dir, corrupt[0]), "utf8")).toBe("{not json");
      }));

    it("records despite a stale lock older than 10 s", () =>
      withTempDir((dir) => {
        const lock = join(dir, ".lock");
        mkdirSync(lock);
        const old = new Date(Date.now() - 60_000);
        utimesSync(lock, old, old);
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(readJson(join(dir, "h1.json")).h1.list["2026-11-14T08"]).toBe(1);
        expect(existsSync(lock)).toBe(false);
      }));

    it("counts exactly 20 for 20 concurrent processes", () =>
      withTempDir(async (dir) => {
        const url = pathToFileURL(USAGE_SRC).href;
        const code =
          `import { recordUsage } from ${JSON.stringify(url)};` +
          `recordUsage({ dir: ${JSON.stringify(dir)}, host: "h1", action: "run", cmd: "x", now: new Date(${H8.getTime()}) });`;
        await Promise.all(
          Array.from({ length: 20 }, () =>
            execFileAsync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code]),
          ),
        );
        expect(readJson(join(dir, "h1.json")).h1.run["2026-11-14T08"]).toBe(20);
        expect(readJson(join(dir, "h1.cmds.json")).h1.x.run["2026-11-14T08"]).toBe(20);
        expect(existsSync(join(dir, ".lock"))).toBe(false);
      }), 30_000);

    it("prototype-named keys (__proto__ / constructor / read) are stored as own keys, no pollution (N6)", () =>
      withTempDir((dir) => {
        const ctor = Object.prototype.constructor;
        try {
          recordUsage({ dir, host: "h1", action: "constructor", cmd: "__proto__", now: H8 });
          recordUsage({ dir, host: "h1", action: "read", cmd: "__proto__", now: H8 });
          expect(({} as any).read).toBeUndefined();
          expect(({} as any).constructor).toBe(Object);
          recordUsage({ dir, host: "h1", action: "constructor", cmd: "__proto__", now: H8 });

          const actions = readJson(join(dir, "h1.json"));
          expect(Object.hasOwn(actions.h1, "constructor")).toBe(true);
          expect(actions.h1.constructor["2026-11-14T08"]).toBe(2);
          expect(actions.h1.read["2026-11-14T08"]).toBe(1);

          const cmds = readJson(join(dir, "h1.cmds.json"));
          expect(Object.hasOwn(cmds.h1, "__proto__")).toBe(true);
          const proto = cmds.h1["__proto__"];
          expect(Object.hasOwn(proto, "constructor")).toBe(true);
          expect(proto.constructor["2026-11-14T08"]).toBe(2);
          expect(proto.read["2026-11-14T08"]).toBe(1);
          expect(readFileSync(join(dir, "h1.cmds.json"), "utf8")).toContain('"__proto__"');
          expect(({} as any).read).toBeUndefined();
        } finally {
          // undo any pollution so a RED run cannot poison the worker
          delete (Object.prototype as any).read;
          Object.defineProperty(Object.prototype, "constructor", { value: ctor, writable: true, configurable: true, enumerable: false });
        }
      }));
  });

  describe("store lock owner identity (cpal-qp8.9 / G12)", () => {
    /** lock dir as left by an owner `{ pid, start, ns }`; ns defaults to this process's pid namespace */
    function ownedLock(dir: string, owner: { pid: number; start?: string; ns?: string | null }, ageMs = 0): string {
      const lock = join(dir, ".lock");
      mkdirSync(lock);
      const ns = owner.ns === undefined ? SELF_NS : (owner.ns ?? undefined);
      writeFileSync(join(lock, "owner"), JSON.stringify({ ...owner, ns, nonce: "held" }));
      const t = new Date(Date.now() - ageMs);
      utimesSync(lock, t, t);
      return lock;
    }

    it("processIdentity: stable for a live pid, differs across processes, undefined for an exited pid", () => {
      const self = processIdentity(process.pid);
      expect(self).toMatch(/^[0-9a-f-]+:\d+$/);
      expect(processIdentity(process.pid)).toBe(self);
      const child = spawnSync(process.execPath, ["-e", ""]);
      expect(processIdentity(child.pid!)).toBeUndefined();
    });

    it("owner exited and its PID was reused (live pid, other start identity) → lock broken, count kept, no hang", () =>
      withTempDir((dir) => {
        // process.pid is alive, but this owner record has another start identity = a reused pid
        const lock = ownedLock(dir, { pid: process.pid, start: "00000000-0000-0000-0000-000000000000:1" });
        const t = Date.now();
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(Date.now() - t).toBeLessThan(500);
        expect(existsSync(join(dir, "h1.json"))).toBe(true);
        expect(readJson(join(dir, "h1.json")).h1.list["2026-11-14T08"]).toBe(1);
        expect(existsSync(lock)).toBe(false);
      }));

    it("owner pid exited → lock broken immediately even when fresh", () =>
      withTempDir((dir) => {
        const child = spawnSync(process.execPath, ["-e", ""]);
        ownedLock(dir, { pid: child.pid!, start: "00000000-0000-0000-0000-000000000000:1" });
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(existsSync(join(dir, "h1.json"))).toBe(true);
        expect(readJson(join(dir, "h1.json")).h1.list["2026-11-14T08"]).toBe(1);
      }));

    it("live owner (pid + matching start identity) is never broken by age", () =>
      withTempDir((dir) => {
        const lock = ownedLock(dir, { pid: process.pid, start: processIdentity(process.pid) }, 60_000);
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(existsSync(join(dir, "h1.json"))).toBe(false);
        expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).nonce).toBe("held");
      }));

    it("owner in another pid namespace: no pid/identity check (even ESRCH) → kept while fresh, broken once aged", () =>
      withTempDir((dir) => {
        // pid looks exited from HERE, but it belongs to another namespace → only the age rule applies
        const child = spawnSync(process.execPath, ["-e", ""]);
        const lock = ownedLock(dir, { pid: child.pid!, start: "x:1", ns: "pid:[1]" });
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(existsSync(join(dir, "h1.json"))).toBe(false);
        expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).nonce).toBe("held");
        const old = new Date(Date.now() - 11_000);
        utimesSync(lock, old, old);
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(readJson(join(dir, "h1.json")).h1.list["2026-11-14T08"]).toBe(1);
      }));

    it("owner without a recorded namespace → age rule only (fresh lock with exited pid is kept)", () =>
      withTempDir((dir) => {
        const child = spawnSync(process.execPath, ["-e", ""]);
        const lock = ownedLock(dir, { pid: child.pid!, start: "x:1", ns: null });
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(existsSync(join(dir, "h1.json"))).toBe(false);
        expect(existsSync(join(lock, "owner"))).toBe(true);
      }));

    it("acquireOwnedLock records this process's pid namespace in the owner file", () =>
      withTempDir((dir) => {
        const lock = join(dir, ".lock");
        const nonce = acquireOwnedLock(lock, { retries: 1, retryMs: 0, staleMs: 10_000 })!;
        expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).ns).toBe(SELF_NS);
        releaseOwnedLock(lock, nonce);
      }));

    it("zombie owner (exited, not reaped; same pid + start identity) → lock broken", () =>
      withTempDir(async (dir) => {
        // `sleep 0` exits; its parent becomes `sleep 5` via exec, which never reaps it → zombie
        const parent = spawn("sh", ["-c", "sleep 0 & echo $!; exec sleep 5"], { stdio: ["ignore", "pipe", "ignore"] });
        try {
          const pid = Number(await new Promise<string>((r) => parent.stdout!.once("data", (d) => r(String(d).trim()))));
          const isZombie = () => {
            try {
              const st = readFileSync(`/proc/${pid}/stat`, "utf8");
              return st.slice(st.lastIndexOf(")") + 2).split(" ")[0] === "Z";
            } catch {
              return false;
            }
          };
          for (let i = 0; i < 100 && !isZombie(); i++) await new Promise((r) => setTimeout(r, 20));
          expect(isZombie()).toBe(true);
          const start = processIdentity(pid);
          expect(start).toBeDefined();
          ownedLock(dir, { pid, start });
          recordUsage({ dir, host: "h1", action: "list", now: H8 });
          expect(existsSync(join(dir, "h1.json"))).toBe(true);
        } finally {
          parent.kill("SIGKILL");
        }
      }));

    it.skipIf(!HAS_UNSHARE)("real pid namespaces (unshare): live holder inside is not broken from outside", () =>
      withTempDir(async (dir) => {
        const lock = join(dir, ".lock");
        const code =
          `import { acquireOwnedLock, releaseOwnedLock } from ${JSON.stringify(LOCK_SRC_URL)};` +
          `const n = acquireOwnedLock(${JSON.stringify(lock)}, { retries: 1, retryMs: 0, staleMs: 10000 });` +
          `const end = Date.now() + 3000; while (Date.now() < end) {}` +
          `releaseOwnedLock(${JSON.stringify(lock)}, n);`;
        const holder = spawn("unshare", ["-Urpf", "--mount-proc", process.execPath, "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code], { stdio: "ignore" });
        try {
          for (let i = 0; i < 150 && !existsSync(join(lock, "owner")); i++) await new Promise((r) => setTimeout(r, 20));
          const before = readFileSync(join(lock, "owner"), "utf8");
          expect(acquireOwnedLock(lock, { retries: 5, retryMs: 20, staleMs: 10_000 })).toBeUndefined();
          expect(readFileSync(join(lock, "owner"), "utf8")).toBe(before);
        } finally {
          await new Promise((r) => (holder.exitCode !== null ? r(null) : holder.once("exit", r)));
        }
      }), 15_000);

    it.skipIf(!HAS_UNSHARE)("real pid namespaces (unshare): live holder outside is not broken from inside", () =>
      withTempDir((dir) => {
        const lock = join(dir, ".lock");
        const nonce = acquireOwnedLock(lock, { retries: 1, retryMs: 0, staleMs: 10_000 })!;
        try {
          const code =
            `import { acquireOwnedLock } from ${JSON.stringify(LOCK_SRC_URL)};` +
            `console.log(String(acquireOwnedLock(${JSON.stringify(lock)}, { retries: 5, retryMs: 20, staleMs: 10000 })));`;
          const r = spawnSync("unshare", ["-Urpf", "--mount-proc", process.execPath, "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code], { encoding: "utf8" });
          expect(r.stdout.trim()).toBe("undefined");
          expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).nonce).toBe(nonce);
        } finally {
          releaseOwnedLock(lock, nonce);
        }
      }), 15_000);

    it("recordUsage releases its own lock (no owner file or lock dir left)", () =>
      withTempDir((dir) => {
        recordUsage({ dir, host: "h1", action: "list", now: H8 });
        expect(existsSync(join(dir, ".lock"))).toBe(false);
      }));
  });

  describe("defaultUsageDir (N5)", () => {
    it("main checkout (.git dir) → <root>/usage", () =>
      withTempDir((root) => {
        mkdirSync(join(root, ".git"));
        expect(defaultUsageDir(root)).toBe(resolve(root, "usage"));
      }));

    it("linked worktree (.git file) → undefined", () =>
      withTempDir((root) => {
        writeFileSync(join(root, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
        expect(defaultUsageDir(root)).toBeUndefined();
      }));

    it("no .git at all (installed copy) → <root>/usage", () =>
      withTempDir((root) => {
        expect(defaultUsageDir(root)).toBe(resolve(root, "usage"));
      }));
  });
});
