import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.ts";
import { createMockIo, withTempDir } from "./helpers.ts";

/** Two-host fixture usage dir (shapes as written by src/usage.ts). */
function writeFixture(dir: string): void {
  const files: Record<string, unknown> = {
    "hostA.json": { hostA: { read: { "2026-11-13T18": 3, "2026-11-14T02": 1 }, list: { "2026-11-13T18": 5 } } },
    "hostB.json": { hostB: { run: { "2026-11-14T02": 2 }, get: { "2026-11-12T23": 1 } } },
    "hostA.cmds.json": {
      hostA: { deploy: { read: { "2026-11-13T18": 2, "2026-11-14T02": 1 } }, status: { read: { "2026-11-13T18": 1 } } },
    },
    "hostB.cmds.json": { hostB: { status: { run: { "2026-11-14T02": 2 } }, deploy: { get: { "2026-11-12T23": 1 } } } },
  };
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(data, null, 2));
}

async function stats(dir: string, args: string[] = [], env: Record<string, string> = {}) {
  const io = createMockIo({ env: { CMD_PALLET_USAGE_DIR: dir, ...env } });
  const code = await runCli(["stats", ...args], io);
  return { code, out: io.stdout.toString(), err: io.stderr.toString() };
}

async function statsJson(dir: string, args: string[] = []) {
  const res = await stats(dir, [...args, "--json"]);
  return { ...res, data: JSON.parse(res.out) };
}

describe("stats verb", () => {
  it("--json: top commands ordered by total with per-host split", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const { code, data } = await statsJson(dir);
      expect(code).toBe(0);
      expect(Object.keys(data).sort()).toEqual(["byDateHour", "byHost", "byHourOfDay", "topCommands"]);
      expect(data.topCommands).toEqual([
        { cmd: "deploy", total: 4, byHost: { hostA: 3, hostB: 1 } },
        { cmd: "status", total: 3, byHost: { hostA: 1, hostB: 2 } },
      ]);
    }));

  it("--json: by machine totals + top action, sorted desc", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const { data } = await statsJson(dir);
      expect(data.byHost).toEqual([
        { host: "hostA", total: 9, topAction: "list", topActionCount: 5 },
        { host: "hostB", total: 3, topAction: "run", topActionCount: 2 },
      ]);
    }));

  it("--json: date-hour (most recent first) and hour-of-day sums across hosts", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const { data } = await statsJson(dir);
      expect(data.byDateHour).toEqual([
        { dateHour: "2026-11-14T02", total: 3 },
        { dateHour: "2026-11-13T18", total: 8 },
        { dateHour: "2026-11-12T23", total: 1 },
      ]);
      expect(data.byHourOfDay).toEqual([
        { hour: "02", total: 3 },
        { hour: "18", total: 8 },
        { hour: "23", total: 1 },
      ]);
    }));

  it("--host filters every section to one host", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const { code, data } = await statsJson(dir, ["--host", "hostB"]);
      expect(code).toBe(0);
      expect(data.topCommands).toEqual([
        { cmd: "status", total: 2, byHost: { hostB: 2 } },
        { cmd: "deploy", total: 1, byHost: { hostB: 1 } },
      ]);
      expect(data.byHost).toEqual([{ host: "hostB", total: 3, topAction: "run", topActionCount: 2 }]);
      expect(data.byDateHour).toEqual([
        { dateHour: "2026-11-14T02", total: 2 },
        { dateHour: "2026-11-12T23", total: 1 },
      ]);
      expect(data.byHourOfDay).toEqual([
        { hour: "02", total: 2 },
        { hour: "23", total: 1 },
      ]);
    }));

  it("--top N limits top commands and date-hour rows", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const { data } = await statsJson(dir, ["--top", "1"]);
      expect(data.topCommands.map((r: any) => r.cmd)).toEqual(["deploy"]);
      expect(data.byDateHour.map((r: any) => r.dateHour)).toEqual(["2026-11-14T02"]);
      expect(data.byHost).toHaveLength(2);
    }));

  it("--top with a non-positive / non-numeric value → usage error exit 2", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      expect((await stats(dir, ["--top", "0"])).code).toBe(2);
      expect((await stats(dir, ["--top", "abc"])).code).toBe(2);
      expect((await stats(dir, ["--top"])).code).toBe(2);
    }));

  it("text output: three sections with rows in rank order", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const { code, out } = await stats(dir);
      expect(code).toBe(0);
      expect(out).toMatch(/Top commands/);
      expect(out).toMatch(/By machine/);
      expect(out).toMatch(/By time/);
      expect(out).toMatch(/Hour of day/);
      expect(out).toMatch(/deploy\s+4\s+hostA=3 hostB=1/);
      expect(out.indexOf("deploy")).toBeLessThan(out.indexOf("status"));
      expect(out).toMatch(/hostA\s+9\s+list \(5\)/);
      expect(out).toMatch(/2026-11-13T18\s+8/);
      expect(out.indexOf("2026-11-14T02")).toBeLessThan(out.indexOf("2026-11-13T18"));
    }));

  it("corrupt file is skipped with one stderr warning, rest still counted", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      writeFileSync(join(dir, "hostC.json"), "{ not json");
      const { code, data, err } = await statsJson(dir);
      expect(code).toBe(0);
      expect(err.match(/hostC\.json/g)).toHaveLength(1);
      expect(data.byHost.map((r: any) => r.host)).toEqual(["hostA", "hostB"]);
    }));

  it("ignores non-.json artifacts (.sync-log, .tmp-*, .corrupt-*)", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      writeFileSync(join(dir, ".sync-log"), "junk");
      writeFileSync(join(dir, "hostA.json.tmp-1-2"), "junk");
      writeFileSync(join(dir, "hostA.json.corrupt-123"), "junk");
      const { code, err, data } = await statsJson(dir);
      expect(code).toBe(0);
      expect(err).toBe("");
      expect(data.byHost[0].total).toBe(9);
    }));

  it("empty dir → 'no usage recorded', exit 0", () =>
    withTempDir(async (dir) => {
      const { code, out } = await stats(dir);
      expect(code).toBe(0);
      expect(out).toMatch(/no usage recorded/);
    }));

  it("missing dir → 'no usage recorded', exit 0; --json → empty sections", () =>
    withTempDir(async (dir) => {
      const missing = join(dir, "nope");
      const { code, out } = await stats(missing);
      expect(code).toBe(0);
      expect(out).toMatch(/no usage recorded/);
      const j = await statsJson(missing);
      expect(j.code).toBe(0);
      expect(j.data).toEqual({ topCommands: [], byHost: [], byDateHour: [], byHourOfDay: [] });
    }));

  it("never writes to the usage dir", () =>
    withTempDir(async (dir) => {
      writeFixture(dir);
      const before = readdirSync(dir).sort();
      const snap = before.map((f) => readFileSync(join(dir, f), "utf8"));
      await stats(dir);
      await stats(dir, ["--json"]);
      expect(readdirSync(dir).sort()).toEqual(before);
      expect(before.map((f) => readFileSync(join(dir, f), "utf8"))).toEqual(snap);
    }));

  it("a `stats` invocation is itself recorded as action `stats` when recording is on", () =>
    withTempDir(async (dir) => {
      const { code } = await stats(dir, [], { CMD_PALLET_USAGE: "1", CMD_PALLET_USAGE_SYNC_MIN: "99999" });
      expect(code).toBe(0);
      const host = hostname();
      const data = JSON.parse(readFileSync(join(dir, `${host}.json`), "utf8"));
      expect(Object.values(data[host].stats)).toEqual([1]);
    }));
});
