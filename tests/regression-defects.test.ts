import { describe, it, expect, beforeEach } from "vitest";
import { runCli } from "../src/cli.ts";
import { createMockIo, FIXTURE_ROOT, withTempDir } from "./helpers.ts";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const binPath = resolve(__dirname, "../bin/cmd-pallet.js");

describe("Regression Tests — Live-Verified Defects", () => {
  let io: ReturnType<typeof createMockIo>;

  beforeEach(() => {
    io = createMockIo();
  });

  describe("D1: Qualified-Name Resolvability", () => {
    it("resolves read with exact qualified candidate name (e.g. claude:dup-command) and prints content", async () => {
      const exitCode = await runCli(["read", "claude:dup-command"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("Claude duplicate command");
    });

    it("resolves read with exact qualified candidate name for other agent (codex:dup-command)", async () => {
      const exitCode = await runCli(["read", "codex:dup-command"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("Codex duplicate command");
    });

    it("resolves run with exact qualified candidate name and prints Invoked header + interpolated body", async () => {
      const exitCode = await runCli(["run", "claude:dup-command", "my-arg"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toMatch(/Invoked:\s*\/(claude:)?dup-command/i);
      expect(out).toContain("Claude duplicate command");
    });

    it("resolves run with exact qualified candidate name for codex and prints body", async () => {
      const exitCode = await runCli(["run", "codex:dup-command", "my-arg"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toMatch(/Invoked:\s*\/(codex:)?dup-command/i);
      expect(out).toContain("Codex duplicate command");
    });

    it("is tolerant to leading slash with qualified names (/claude:dup-command)", async () => {
      const exitCode = await runCli(["read", "/claude:dup-command"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("Claude duplicate command");
    });

    it("ensures every candidate printed in ambiguity list is directly resolvable via read and run", async () => {
      // 1. Trigger ambiguity for dup-command
      const ambigExit = await runCli(["read", "dup-command", "--json"], io);
      expect(ambigExit).toBe(1);
      const json = JSON.parse(io.stdout.toString());
      expect(json.candidates).toBeDefined();
      expect(json.candidates.length).toBeGreaterThanOrEqual(2);

      // 2. Every candidate from the ambiguity list MUST be directly resolvable
      for (const candidate of json.candidates as string[]) {
        const readIo = createMockIo();
        const readCode = await runCli(["read", candidate], readIo);
        expect(readCode).toBe(0);
        expect(readIo.stdout.toString().length).toBeGreaterThan(0);

        const runIo = createMockIo();
        const runCode = await runCli(["run", candidate], runIo);
        expect(runCode).toBe(0);
        expect(runIo.stdout.toString()).toContain("Invoked:");
      }
    });

    it("supports json flag with qualified name for read and run", async () => {
      const readExit = await runCli(["read", "claude:dup-command", "--json"], io);
      expect(readExit).toBe(0);
      const readJson = JSON.parse(io.stdout.toString());
      expect(readJson.source.agent).toBe("claude");
      expect(readJson.content).toContain("Claude duplicate command");

      io.stdout.clear();
      const runExit = await runCli(["run", "claude:dup-command", "arg1", "--json"], io);
      expect(runExit).toBe(0);
      const runJson = JSON.parse(io.stdout.toString());
      expect(runJson.output).toContain("Claude duplicate command");
    });
  });

  describe("D2: Exit-Code Violations at Binary and Dispatch Level", () => {
    describe("direct process spawning (bin/cmd-pallet.js)", () => {
      it("exits with 1 when reading a missing / nonexistent command name", () => {
        const res = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "read", "nonexistent-cmd-xyz"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(res.status).toBe(1);
        expect(res.stderr + res.stdout).toMatch(/not found/i);
      });

      it("exits with 1 when running a missing / nonexistent command name", () => {
        const res = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "run", "nonexistent-cmd-xyz"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(res.status).toBe(1);
        expect(res.stderr + res.stdout).toMatch(/not found/i);
      });

      it("exits with 1 when reading an ambiguous command name and prints candidates", () => {
        const res = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "read", "dup-command"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(res.status).toBe(1);
        expect(res.stderr + res.stdout).toMatch(/ambiguous|multiple candidates/i);
        expect(res.stderr + res.stdout).toContain("claude:dup-command");
        expect(res.stderr + res.stdout).toContain("codex:dup-command");
      });

      it("exits with 1 when running an ambiguous command name and prints candidates", () => {
        const res = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "run", "dup-command"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(res.status).toBe(1);
        expect(res.stderr + res.stdout).toMatch(/ambiguous|multiple candidates/i);
        expect(res.stderr + res.stdout).toContain("claude:dup-command");
        expect(res.stderr + res.stdout).toContain("codex:dup-command");
      });

      it("exits with 2 on usage error when command name argument is missing for read/run", () => {
        const resRead = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "read"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(resRead.status).toBe(2);
        expect(resRead.stderr).toMatch(/missing command name|usage/i);

        const resRun = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "run"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(resRun.status).toBe(2);
        expect(resRun.stderr).toMatch(/missing command name|usage/i);
      });

      it("exits with 1 when search or list query yields no matches", () => {
        const resSearch = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "search", "nonexistent-xyz-query-999"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(resSearch.status).toBe(1);

        const resList = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "list", "nonexistent-xyz-query-999"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(resList.status).toBe(1);
      });

      it("exits with 0 when reading a valid command", () => {
        const res = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "read", "deploy"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain("# deploy");
      });

      it("exits with 0 when running a valid command", () => {
        const res = spawnSync(
          process.execPath,
          ["--experimental-strip-types", binPath, "run", "deploy", "staging"],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              PI_CODING_AGENT_DIR: FIXTURE_ROOT,
              CMD_PALLET_CACHE_TTL: "0",
            },
          }
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain("Invoked: /deploy staging");
      });
    });
  });

  describe("D3: Duplicate Deduplication in search and list Output", () => {
    it("deduplicates commands in list text output so no command name appears on multiple lines", async () => {
      const exitCode = await runCli(["list"], io);
      expect(exitCode).toBe(0);
      const lines = io.stdout
        .toString()
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0);

      const commandNames = lines.map((l) => l.split(/\t|\s{2,}/)[0].trim());
      const uniqueNames = new Set(commandNames);

      // No duplicate command names in list output
      expect(commandNames.length).toBe(uniqueNames.size);
    });

    it("preserves cross-agent commands in search text output when multiple agents have same command name", async () => {
      const exitCode = await runCli(["search", "dup-command"], io);
      expect(exitCode).toBe(0);
      const lines = io.stdout
        .toString()
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0);

      const dupLines = lines.filter((l) => l.includes("dup-command"));
      expect(dupLines.length).toBe(2);
      expect(io.stdout.toString()).toMatch(/claude:dup-command|dup-command.*claude/i);
      expect(io.stdout.toString()).toMatch(/codex:dup-command|dup-command.*codex/i);
    });

    it("preserves cross-agent commands in json list and search output", async () => {
      const listExit = await runCli(["list", "--json"], io);
      expect(listExit).toBe(0);
      const listJson = JSON.parse(io.stdout.toString());
      const dupEntries = listJson.filter(
        (c: any) =>
          c.name === "dup-command" ||
          c.name?.endsWith(":dup-command") ||
          c.name?.includes("dup-command")
      );
      expect(dupEntries.length).toBe(2);

      io.stdout.clear();
      const searchExit = await runCli(["search", "dup-command", "--json"], io);
      expect(searchExit).toBe(0);
      const searchJson = JSON.parse(io.stdout.toString());
      expect(searchJson.length).toBe(2);
      const agents = searchJson.map((c: any) => c.source?.agent);
      expect(agents).toContain("claude");
      expect(agents).toContain("codex");
    });

    it("deduplicates identical commands within the same agent across scopes", async () => {
      await withTempDir(async (tmp) => {
        // Setup 1 agent with identical command in globalDir and projectDir
        const claudeGlobal = join(tmp, "global-claude");
        const claudeProject = join(tmp, "project-claude");
        mkdirSync(claudeGlobal, { recursive: true });
        mkdirSync(claudeProject, { recursive: true });

        const cmdContent = "---\nname: deploy-sync\ndescription: Sync command across scopes\n---\necho sync";
        writeFileSync(join(claudeGlobal, "deploy-sync.md"), cmdContent);
        writeFileSync(join(claudeProject, "deploy-sync.md"), cmdContent);

        const agentDir = join(tmp, "agent");
        mkdirSync(agentDir, { recursive: true });
        const config = {
          agents: {
            claude: { enabled: true, globalDir: claudeGlobal, projectDir: "project-claude", recursive: true },
          },
          custom: [],
        };
        writeFileSync(join(agentDir, "unify-cmd.json"), JSON.stringify(config, null, 2));

        const customIo = createMockIo({
          cwd: tmp,
          env: {
            PI_CODING_AGENT_DIR: tmp,
          },
        });

        const exitCode = await runCli(["search", "deploy-sync"], customIo);
        expect(exitCode).toBe(0);
        const lines = customIo.stdout
          .toString()
          .trim()
          .split("\n")
          .filter((l) => l.trim().length > 0);

        // Must appear exactly once for the same agent, not duplicated
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain("deploy-sync");
      });
    });
  });
});
