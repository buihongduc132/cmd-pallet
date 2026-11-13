import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as dispatchMod from "../src/dispatch.ts";
import { runCli } from "../src/cli.ts";
import { dateHourKey } from "../src/usage.ts";
import { createMockIo, withTempDir } from "./helpers.ts";

const host = hostname();

function ioFor(dir: string, extra?: Record<string, string>) {
  return createMockIo({ env: { CMD_PALLET_USAGE: "1", CMD_PALLET_USAGE_DIR: dir, ...extra } });
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"));
}

function actionCount(dir: string, action: string): number {
  const data = readJson(join(dir, `${host}.json`));
  const hours = data[host]?.[action] ?? {};
  return Object.values(hours).reduce((a: number, b) => a + (b as number), 0);
}

describe("runCli usage recording", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list → actions file `list` count 1, no cmds file", () =>
    withTempDir(async (dir) => {
      const code = await runCli(["list"], ioFor(dir));
      expect(code).toBe(0);
      expect(actionCount(dir, "list")).toBe(1);
      const data = readJson(join(dir, `${host}.json`));
      expect(data[host].list[dateHourKey(new Date())]).toBe(1);
      expect(existsSync(join(dir, `${host}.cmds.json`))).toBe(false);
    }));

  it("read <agent:name> → cmds keyed by RESOLVED name", () =>
    withTempDir(async (dir) => {
      const code = await runCli(["read", "claude:deploy"], ioFor(dir));
      expect(code).toBe(0);
      expect(actionCount(dir, "read")).toBe(1);
      const cmds = readJson(join(dir, `${host}.cmds.json`));
      expect(Object.keys(cmds[host])).toEqual(["deploy"]);
      expect(Object.values(cmds[host].deploy.read)).toEqual([1]);
    }));

  it("run </name> → cmds keyed by resolved name", () =>
    withTempDir(async (dir) => {
      await runCli(["run", "/status"], ioFor(dir));
      const cmds = readJson(join(dir, `${host}.cmds.json`));
      expect(Object.keys(cmds[host])).toEqual(["status"]);
      expect(cmds[host].status.run).toBeDefined();
    }));

  it("get <missing> → cmds keyed by typed name", () =>
    withTempDir(async (dir) => {
      const code = await runCli(["get", "no-such-cmd"], ioFor(dir));
      expect(code).toBe(1);
      expect(actionCount(dir, "get")).toBe(1);
      const cmds = readJson(join(dir, `${host}.cmds.json`));
      expect(Object.keys(cmds[host])).toEqual(["no-such-cmd"]);
      expect(cmds[host]["no-such-cmd"].get).toBeDefined();
    }));

  it("read <ambiguous> → cmds keyed by typed name", () =>
    withTempDir(async (dir) => {
      await runCli(["read", "dup-command"], ioFor(dir));
      const cmds = readJson(join(dir, `${host}.cmds.json`));
      expect(Object.keys(cmds[host])).toEqual(["dup-command"]);
    }));

  it("unknown verb → `unknown`", () =>
    withTempDir(async (dir) => {
      const code = await runCli(["bogus"], ioFor(dir));
      expect(code).toBe(2);
      expect(actionCount(dir, "unknown")).toBe(1);
    }));

  it("--version → `version`; list --version → `version`", () =>
    withTempDir(async (dir) => {
      await runCli(["--version"], ioFor(dir));
      await runCli(["list", "--version"], ioFor(dir));
      expect(actionCount(dir, "version")).toBe(2);
    }));

  it("no args → `help`", () =>
    withTempDir(async (dir) => {
      await runCli([], ioFor(dir));
      expect(actionCount(dir, "help")).toBe(1);
    }));

  it("CMD_PALLET_USAGE=0 → no files", () =>
    withTempDir(async (dir) => {
      const code = await runCli(["read", "deploy"], ioFor(dir, { CMD_PALLET_USAGE: "0" }));
      expect(code).toBe(0);
      expect(readdirSync(dir)).toEqual([]);
    }));

  it("broken store → exit code and stdout identical to usage disabled", () =>
    withTempDir(async (dir) => {
      const broken = join(dir, "not-a-dir");
      writeFileSync(broken, "x");
      for (const argv of [["read", "deploy"], ["bogus"], ["list"]]) {
        const off = createMockIo({ env: { CMD_PALLET_USAGE: "0" } });
        const on = ioFor(broken);
        const codeOff = await runCli(argv, off);
        const codeOn = await runCli(argv, on);
        expect(codeOn).toBe(codeOff);
        expect(on.stdout.toString()).toBe(off.stdout.toString());
        expect(on.stderr.toString()).toBe(off.stderr.toString());
      }
    }));

  it("dispatch throwing → still recorded once and error propagates", () =>
    withTempDir(async (dir) => {
      vi.spyOn(dispatchMod, "dispatch").mockRejectedValue(new Error("boom"));
      await expect(runCli(["list"], ioFor(dir))).rejects.toThrow("boom");
      expect(actionCount(dir, "list")).toBe(1);
    }));
});
