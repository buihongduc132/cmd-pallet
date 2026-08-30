import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/flags.ts";
import { runCli } from "../src/cli.ts";
import { createMockIo } from "./helpers.ts";

describe("Flag Parsing", () => {
  describe("parseArgs unit tests", () => {
    it("parses verb and positional arguments", () => {
      const parsed = parseArgs(["read", "deploy"]);
      expect(parsed.verb).toBe("read");
      expect(parsed.positional).toEqual(["deploy"]);
    });

    it("parses --json after positional arguments", () => {
      const parsed = parseArgs(["read", "deploy", "--json"]);
      expect(parsed.verb).toBe("read");
      expect(parsed.positional).toEqual(["deploy"]);
      expect(parsed.flags.json).toBe(true);
    });

    it("parses --json before positional arguments", () => {
      const parsed = parseArgs(["read", "--json", "deploy"]);
      expect(parsed.verb).toBe("read");
      expect(parsed.positional).toEqual(["deploy"]);
      expect(parsed.flags.json).toBe(true);
    });

    it("parses --json before verb", () => {
      const parsed = parseArgs(["--json", "list", "deploy"]);
      expect(parsed.verb).toBe("list");
      expect(parsed.positional).toEqual(["deploy"]);
      expect(parsed.flags.json).toBe(true);
    });

    it("parses --dry-run for sync verb", () => {
      const parsed = parseArgs(["sync", "/tmp/out", "--dry-run"]);
      expect(parsed.verb).toBe("sync");
      expect(parsed.positional).toEqual(["/tmp/out"]);
      expect(parsed.flags.dryRun).toBe(true);
    });

    it("stops parsing flags after '--' delimiter", () => {
      const parsed = parseArgs(["run", "deploy", "--", "--json", "-v", "--my-flag"]);
      expect(parsed.verb).toBe("run");
      expect(parsed.positional).toEqual(["deploy", "--json", "-v", "--my-flag"]);
      expect(parsed.flags.json).toBeUndefined();
    });

    it("recognizes -h and --help as help flag", () => {
      const parsed1 = parseArgs(["--help"]);
      expect(parsed1.flags.help).toBe(true);

      const parsed2 = parseArgs(["-h"]);
      expect(parsed2.flags.help).toBe(true);
    });

    it("recognizes -v and --version as version flag", () => {
      const parsed1 = parseArgs(["--version"]);
      expect(parsed1.flags.version).toBe(true);

      const parsed2 = parseArgs(["-v"]);
      expect(parsed2.flags.version).toBe(true);
    });
  });

  describe("CLI integration with flag positioning", () => {
    it("handles `get --json <name>` without mistaking --json for command name", async () => {
      const io = createMockIo();
      const exitCode = await runCli(["get", "--json", "deploy"], io);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(io.stdout.toString());
      expect(parsed.name).toBe("deploy");
    });

    it("handles `read <name> --json` correctly", async () => {
      const io = createMockIo();
      const exitCode = await runCli(["read", "deploy", "--json"], io);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(io.stdout.toString());
      expect(parsed.name).toBe("deploy");
    });
  });
});
