import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { actionOf, dateHourKey, recordUsage } from "../src/usage.ts";
import { withTempDir } from "./helpers.ts";

const execFileAsync = promisify(execFile);
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
      expect(actionOf("list", { version: true }, true)).toBe("list");
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
  });
});
