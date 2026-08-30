import { describe, it, expect } from "vitest";
import { runCli } from "../src/cli.ts";
import { createMockIo, FIXTURE_ROOT } from "./helpers.ts";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const binPath = resolve(__dirname, "../bin/cmd-pallet.js");

describe("Smoke Test — End-to-End CLI", () => {
  it("executes full CLI workflow against checked-in fixture catalog", async () => {
    const io = createMockIo();

    // 1. ping
    const pingExit = await runCli(["ping"], io);
    expect(pingExit).toBe(0);
    expect(io.stdout.toString()).toMatch(/ok/i);
    io.stdout.clear();

    // 2. list
    const listExit = await runCli(["list"], io);
    expect(listExit).toBe(0);
    expect(io.stdout.toString().length).toBeGreaterThan(0);
    io.stdout.clear();

    // 3. help
    const helpExit = await runCli(["help"], io);
    expect(helpExit).toBe(0);
    expect(io.stdout.toString()).toContain("Usage:");
    io.stdout.clear();

    // 4. json list
    const jsonListExit = await runCli(["list", "--json"], io);
    expect(jsonListExit).toBe(0);
    const parsed = JSON.parse(io.stdout.toString());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("launches bin/cmd-pallet.js binary directly and enters CLI dispatcher", () => {
    const res = spawnSync(process.execPath, [binPath, "help"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: FIXTURE_ROOT,
        CMD_PALLET_CACHE_TTL: "0",
      },
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage:");
  });

  it("handles real catalog opt-in via CMD_PALLET_TEST_REAL_CATALOG with explicit SKIP if absent", async () => {
    const realConfigPath = join(homedir(), ".pi", "agent", "unify-cmd.json");
    if (process.env.CMD_PALLET_TEST_REAL_CATALOG !== "1" || !existsSync(realConfigPath)) {
      console.log("SKIP: Real catalog opt-in unset (CMD_PALLET_TEST_REAL_CATALOG!=1) or real catalog absent");
      return;
    }

    const realIo = createMockIo({
      cwd: process.cwd(),
      env: {
        PI_CODING_AGENT_DIR: join(homedir(), ".pi"),
        CMD_PALLET_TEST_REAL_CATALOG: "1",
      },
    });

    const exitCode = await runCli(["ping"], realIo);
    expect(exitCode).toBe(0);
    expect(realIo.stdout.toString()).toMatch(/^ok/i);
  });
});
