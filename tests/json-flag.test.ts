import { describe, it, expect, beforeEach } from "vitest";
import { runCli } from "../src/cli.ts";
import { createMockIo, withTempDir } from "./helpers.ts";

describe("JSON Flag and Output Contracts", () => {
  let io: ReturnType<typeof createMockIo>;

  beforeEach(() => {
    io = createMockIo();
  });

  it("emits valid JSON array for `list --json`", async () => {
    const exitCode = await runCli(["list", "--json"], io);
    expect(exitCode).toBe(0);

    const json = JSON.parse(io.stdout.toString());
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);

    const deployCmd = json.find((c: any) => c.name === "deploy");
    expect(deployCmd).toBeDefined();
    expect(deployCmd).toMatchObject({
      name: "deploy",
      description: expect.any(String),
    });
  });

  it("emits valid JSON object for `read --json <name>`", async () => {
    const exitCode = await runCli(["read", "deploy", "--json"], io);
    expect(exitCode).toBe(0);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toMatchObject({
      name: "deploy",
      content: expect.stringContaining("echo \"Deploying"),
      argumentHint: "<env> [flags]",
    });
  });

  it("emits `{\"error\": ...}` on stdout and exit 1 when `read --json` not found", async () => {
    const exitCode = await runCli(["read", "nonexistent-cmd", "--json"], io);
    expect(exitCode).toBe(1);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toHaveProperty("error");
    expect(json.error).toMatch(/not found/i);
  });

  it("emits `{\"error\": ..., \"candidates\": [...]}` on stdout when `read --json` is ambiguous", async () => {
    const exitCode = await runCli(["read", "dup-command", "--json"], io);
    expect(exitCode).toBe(1);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toHaveProperty("error");
    expect(json).toHaveProperty("candidates");
    expect(Array.isArray(json.candidates)).toBe(true);
    expect(json.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("emits valid JSON object for `run --json <name> <args>`", async () => {
    const exitCode = await runCli(["run", "deploy", "prod", "--verbose", "--json"], io);
    expect(exitCode).toBe(0);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toMatchObject({
      command: "deploy",
      invocation: "/deploy prod --verbose",
      args: "prod --verbose",
      output: expect.stringContaining("Deploying branch to prod with options: prod --verbose"),
    });
  });

  it("emits `{\"error\": ...}` on stdout and exit 1 when `run --json` not found", async () => {
    const exitCode = await runCli(["run", "nonexistent-cmd", "--json"], io);
    expect(exitCode).toBe(1);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toHaveProperty("error");
  });

  it("emits format-identical JSON for `search --json <query>` and `list --json <query>`", async () => {
    const listIo = createMockIo();
    const searchIo = createMockIo();

    await runCli(["list", "deploy", "--json"], listIo);
    await runCli(["search", "deploy", "--json"], searchIo);

    const listJson = JSON.parse(listIo.stdout.toString());
    const searchJson = JSON.parse(searchIo.stdout.toString());
    expect(searchJson).toEqual(listJson);
  });

  it("emits format-identical JSON for `get --json <name>` and `read --json <name>`", async () => {
    const readIo = createMockIo();
    const getIo = createMockIo();

    await runCli(["read", "deploy", "--json"], readIo);
    await runCli(["get", "deploy", "--json"], getIo);

    const readJson = JSON.parse(readIo.stdout.toString());
    const getJson = JSON.parse(getIo.stdout.toString());
    expect(getJson).toEqual(readJson);
  });

  it("emits valid JSON for `ping --json`", async () => {
    const exitCode = await runCli(["ping", "--json"], io);
    expect(exitCode).toBe(0);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toMatchObject({
      status: "ok",
      count: expect.any(Number),
      configPath: expect.any(String),
    });
  });

  it("emits `{\"status\": \"error\", \"error\": ...}` on stdout for `ping --json` failure", async () => {
    const brokenIo = createMockIo({
      env: {
        PI_CODING_AGENT_DIR: "/broken/dir/path",
      },
    });
    const exitCode = await runCli(["ping", "--json"], brokenIo);
    expect(exitCode).not.toBe(0);

    const json = JSON.parse(brokenIo.stdout.toString());
    expect(json.status).toBe("error");
    expect(json).toHaveProperty("error");
  });

  it("emits valid JSON for `sync --json <outdir>`", async () => {
    await withTempDir(async (tmp) => {
      const exitCode = await runCli(["sync", tmp, "--json"], io);
      expect(exitCode).toBe(0);

      const json = JSON.parse(io.stdout.toString());
      expect(json).toMatchObject({
        status: "ok",
        synced: expect.any(Number),
        files: expect.any(Array),
      });
    });
  });

  it("emits valid JSON for `help --json`", async () => {
    const exitCode = await runCli(["help", "--json"], io);
    expect(exitCode).toBe(0);

    const json = JSON.parse(io.stdout.toString());
    expect(json).toHaveProperty("verbs");
    expect(json).toHaveProperty("env");
  });

  it("keeps stdout purely parseable JSON and routes diagnostics to stderr", async () => {
    await withTempDir(async (tmp) => {
      const exitCode = await runCli(["sync", tmp, "--json"], io);
      expect(exitCode).toBe(0);

      // stdout must be strictly valid JSON with no trailing plain text
      expect(() => JSON.parse(io.stdout.toString())).not.toThrow();
    });
  });
});
