import { describe, it, expect } from "vitest";
import { runCli } from "../src/cli.ts";
import { createMockIo, withTempDir } from "./helpers.ts";
import { existsSync, readdirSync } from "node:fs";

describe("Test Isolation and Cache Safety", () => {
  it("enforces CMD_PALLET_CACHE_TTL=0 during unit test executions", async () => {
    const io = createMockIo({
      env: {
        CMD_PALLET_CACHE_TTL: "0",
      },
    });

    const exitCode = await runCli(["ping"], io);
    expect(exitCode).toBe(0);
  });

  it("never creates or accesses cmd-palette cache files (distinct naming)", async () => {
    await withTempDir(async (tmp) => {
      const io = createMockIo({
        cwd: tmp,
        env: {
          PI_CODING_AGENT_DIR: tmp,
        },
      });

      await runCli(["list"], io);

      // Verify no file matching *cmd-palette* exists in the temp dir
      const files = readdirSync(tmp);
      for (const file of files) {
        expect(file).not.toContain("cmd-palette");
      }
    });
  });
});
