import { describe, it, expect } from "vitest";
import { runCli } from "../src/cli.ts";
import { createMockIo } from "./helpers.ts";

describe("Read Golden Tests and Frontmatter Hygiene", () => {
  it("golden test: renders argument-hint line properly for command with argument-hint", async () => {
    const io = createMockIo();
    const exitCode = await runCli(["read", "deploy"], io);
    expect(exitCode).toBe(0);

    const out = io.stdout.toString();
    const lines = out.split("\n");

    // Line 1: # deploy
    expect(lines[0].trim()).toBe("# deploy");
    // Line 2: argument-hint: <env> [flags]
    expect(lines[1].trim()).toBe("argument-hint: <env> [flags]");
    // Line 3: blank line
    expect(lines[2].trim()).toBe("");
    // Line 4+: content
    expect(lines[3]).toContain("Deploying branch");

    // MUST NOT have leading frontmatter ---
    expect(out.trim().startsWith("---")).toBe(false);
  });

  it("golden test: duplicate command name ambiguity produces candidates and exits with code 1", async () => {
    const io = createMockIo();
    const exitCode = await runCli(["read", "dup-command"], io);
    expect(exitCode).toBe(1);

    const output = io.stderr.toString() + io.stdout.toString();
    expect(output).toMatch(/ambiguous|candidates/i);
    expect(output).toContain("claude:dup-command");
    expect(output).toContain("codex:dup-command");
  });
});
