import { describe, it, expect } from "vitest";
import { runCli } from "../src/cli.ts";
import { loadCatalog } from "../src/catalog.ts";
import { createMockIo, FIXTURE_ROOT, withTempDir } from "./helpers.ts";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("Arbiter Audit Findings — Regression Tests (TDD RED)", () => {
  // A1 [rank4] PROD INSTALL DEAD
  describe("A1 [rank4]: Production install dependencies include typescript", () => {
    it("asserts package.json dependencies contains typescript so global install runs without devDependencies", () => {
      const pkgPath = resolve(__dirname, "../package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies).toHaveProperty("typescript");
      expect(typeof pkg.dependencies.typescript).toBe("string");
    });
  });

  // A2 [rank4] LIST DEDUPE HIDES CROSS-AGENT CMDS
  describe("A2 [rank4]: Cross-agent commands are not hidden by list deduplication", () => {
    it("shows both commands in list text output when same name exists across multiple agents", async () => {
      const io = createMockIo();
      const exitCode = await runCli(["list"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();

      // Checked-in fixture has dup-command in both claude and codex
      // Both commands must be visible in list output (qualified or agent-prefixed on collision)
      const lines = out
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const dupLines = lines.filter((l) => l.includes("dup-command"));
      expect(dupLines.length).toBe(2);
      expect(out).toMatch(/claude:dup-command|dup-command.*claude/i);
      expect(out).toMatch(/codex:dup-command|dup-command.*codex/i);
    });

    it("includes all cross-agent commands in list --json output", async () => {
      const io = createMockIo();
      const exitCode = await runCli(["list", "--json"], io);
      expect(exitCode).toBe(0);
      const listJson = JSON.parse(io.stdout.toString());

      const dupEntries = listJson.filter(
        (c: any) =>
          c.name === "dup-command" ||
          c.name?.endsWith(":dup-command") ||
          c.name?.includes("dup-command")
      );
      expect(dupEntries.length).toBe(2);
      const agents = dupEntries.map((c: any) => c.source?.agent);
      expect(agents).toContain("claude");
      expect(agents).toContain("codex");
    });

    it("reconciles ping count with the exact number of entries in list --json", async () => {
      const pingIo = createMockIo();
      const pingExit = await runCli(["ping", "--json"], pingIo);
      expect(pingExit).toBe(0);
      const pingJson = JSON.parse(pingIo.stdout.toString());

      const listIo = createMockIo();
      const listExit = await runCli(["list", "--json"], listIo);
      expect(listExit).toBe(0);
      const listJson = JSON.parse(listIo.stdout.toString());

      expect(listJson.length).toBe(pingJson.count);
    });
  });

  // A3 [rank4] VACUOUS TESTS
  describe("A3 [rank4]: Non-vacuous collision and skipped-name tests", () => {
    it("errors and exits 1 with stderr warning on real slug collision (foo-bar + foo:bar)", async () => {
      await withTempDir(async (tmpAgentDir) => {
        const agentDir = join(tmpAgentDir, "agent");
        const claudeDir = join(tmpAgentDir, "claude");
        mkdirSync(agentDir, { recursive: true });
        mkdirSync(claudeDir, { recursive: true });

        writeFileSync(join(claudeDir, "foo-bar.md"), "---\nname: foo-bar\n---\necho 1", "utf-8");
        writeFileSync(join(claudeDir, "foo.bar.md"), "---\nname: foo.bar\n---\necho 2", "utf-8");

        const config = {
          agents: {
            claude: { enabled: true, globalDir: claudeDir, recursive: true },
          },
          custom: [],
        };
        writeFileSync(join(agentDir, "unify-cmd.json"), JSON.stringify(config), "utf-8");

        await withTempDir(async (outDir) => {
          const syncIo = createMockIo({
            cwd: tmpAgentDir,
            env: { PI_CODING_AGENT_DIR: tmpAgentDir },
          });
          const exitCode = await runCli(["sync", outDir], syncIo);
          expect(exitCode).toBe(1);
          expect(syncIo.stderr.toString()).toMatch(/collision/i);
        });
      });
    });

    it("warns on stderr mentioning skipped count for empty/invalid command names", async () => {
      await withTempDir(async (tmpAgentDir) => {
        const agentDir = join(tmpAgentDir, "agent");
        const claudeDir = join(tmpAgentDir, "claude");
        mkdirSync(agentDir, { recursive: true });
        mkdirSync(claudeDir, { recursive: true });

        writeFileSync(join(claudeDir, "valid.md"), "---\nname: valid-cmd\n---\necho valid", "utf-8");
        writeFileSync(join(claudeDir, "---.md"), "---\nname: ---\n---\necho empty", "utf-8");

        const config = {
          agents: {
            claude: { enabled: true, globalDir: claudeDir, recursive: true },
          },
          custom: [],
        };
        writeFileSync(join(agentDir, "unify-cmd.json"), JSON.stringify(config), "utf-8");

        await withTempDir(async (outDir) => {
          const syncIo = createMockIo({
            cwd: tmpAgentDir,
            env: { PI_CODING_AGENT_DIR: tmpAgentDir },
          });
          const exitCode = await runCli(["sync", outDir], syncIo);
          expect(exitCode).toBe(0);
          expect(syncIo.stdout.toString()).toContain("synced=1");
          expect(syncIo.stderr.toString()).toMatch(/skipped.*[1-9]|warn/i);
        });
      });
    });
  });

  // A4 [rank3] SMOKE FAKE GATE
  describe("A4 [rank3]: Smoke real catalog gating honoring CMD_PALLET_TEST_REAL_CATALOG", () => {
    it("smoke skips with distinct SKIP marker when env is unset and real catalog is absent", async () => {
      await withTempDir(async (emptyDir) => {
        const io = createMockIo({
          cwd: emptyDir,
          env: {
            PI_CODING_AGENT_DIR: emptyDir,
            CMD_PALLET_TEST_REAL_CATALOG: undefined,
          },
        });

        const pingExit = await runCli(["ping"], io);
        // When gating is honest and real catalog is absent without opt-in env,
        // it must not claim ok status.
        expect(pingExit).not.toBe(0);
        expect(io.stdout.toString()).not.toMatch(/^ok/i);
      });
    });

    it("attempts real catalog load only when CMD_PALLET_TEST_REAL_CATALOG is explicitly enabled", async () => {
      await withTempDir(async (emptyDir) => {
        const io = createMockIo({
          cwd: emptyDir,
          env: {
            PI_CODING_AGENT_DIR: emptyDir,
            CMD_PALLET_TEST_REAL_CATALOG: "1",
          },
        });

        const pingExit = await runCli(["ping"], io);
        // When opted in but catalog directory is empty, ping must fail honestly
        expect(pingExit).not.toBe(0);
        expect(io.stderr.toString() + io.stdout.toString()).toMatch(/error|fault|missing|not found/i);
      });
    });
  });

  // A6 [rank3] CONFIG-MISSING FABRICATION + PING LIES
  describe("A6 [rank3]: Missing config causes structured fault without fake configPath", () => {
    it("ping exits with non-zero structured fault and honest message when config is nonexistent", async () => {
      await withTempDir(async (emptyDir) => {
        const io = createMockIo({
          cwd: emptyDir,
          env: {
            PI_CODING_AGENT_DIR: emptyDir,
          },
        });

        const exitCode = await runCli(["ping"], io);
        // Must not exit 0 with "ok" and a fabricated nonexistent configPath
        expect(exitCode).toBe(2);
        const out = io.stdout.toString() + io.stderr.toString();
        expect(out).not.toMatch(/^ok/i);
        expect(out).toMatch(/no config|config not found|missing config|fault|error/i);
        expect(io.stdout.toString()).not.toContain(join(emptyDir, "agent", "unify-cmd.json"));
      });
    });

    it("loadCatalog explicitly reports config-missing rather than fabricating defaults and nonexistent configPath", async () => {
      await withTempDir(async (emptyDir) => {
        await expect(async () => {
          const result = await loadCatalog(emptyDir, { agentDir: emptyDir });
          if (result && result.configPath) {
            expect(existsSync(result.configPath)).toBe(true);
          }
        }).rejects.toThrow(/config/i);
      });
    });
  });

  // A7 [rank3] FIXTURE HACK IN PROD PATH
  describe("A7 [rank3]: Production code contains no test fixture path hacks", () => {
    it("asserts src/catalog.ts contains no literal 'tests/fixtures' substring", () => {
      const catalogSource = readFileSync(
        resolve(__dirname, "../src/catalog.ts"),
        "utf-8"
      );
      expect(catalogSource).not.toContain("tests/fixtures");
    });
  });

  // A8 [rank3] SYNC CROSS-SOURCE OVERWRITE
  describe("A8 [rank3]: Sync does not silently overwrite cross-agent commands with same name", () => {
    it("syncing commands with same name from different agents either errors or creates distinct files with honest synced count", async () => {
      await withTempDir(async (tmpAgentDir) => {
        const agentDir = join(tmpAgentDir, "agent");
        const claudeDir = join(tmpAgentDir, "claude");
        const codexDir = join(tmpAgentDir, "codex");
        mkdirSync(agentDir, { recursive: true });
        mkdirSync(claudeDir, { recursive: true });
        mkdirSync(codexDir, { recursive: true });

        writeFileSync(join(claudeDir, "dup-command.md"), "---\nname: dup-command\n---\nClaude body", "utf-8");
        writeFileSync(join(codexDir, "dup-command.md"), "---\nname: dup-command\n---\nCodex body", "utf-8");

        const config = {
          agents: {
            claude: { enabled: true, globalDir: claudeDir, recursive: true },
            codex: { enabled: true, globalDir: codexDir, recursive: true },
          },
          custom: [],
        };
        writeFileSync(join(agentDir, "unify-cmd.json"), JSON.stringify(config), "utf-8");

        await withTempDir(async (outDir) => {
          const syncIo = createMockIo({
            cwd: tmpAgentDir,
            env: { PI_CODING_AGENT_DIR: tmpAgentDir },
          });

          const exitCode = await runCli(["sync", outDir], syncIo);

          if (exitCode === 0) {
            const filesOnDisk = readdirSync(outDir).filter((f) => f.endsWith(".md"));
            const match = syncIo.stdout.toString().match(/synced=(\d+)/);
            expect(match).not.toBeNull();
            const syncedCount = Number(match![1]);

            // Synced count must equal the number of distinct files on disk (no double count)
            expect(syncedCount).toBe(filesOnDisk.length);
            // Both agents' commands must be preserved (2 files on disk)
            expect(filesOnDisk.length).toBe(2);
          } else {
            expect(exitCode).toBe(1);
            expect(syncIo.stderr.toString()).toMatch(/collision|duplicate/i);
          }
        });
      });
    });

    it("sync with checked-in fixture does not double-count overwritten duplicate command files", async () => {
      await withTempDir(async (outDir) => {
        const syncIo = createMockIo();
        const exitCode = await runCli(["sync", outDir], syncIo);
        expect(exitCode).toBe(0);

        const filesOnDisk = readdirSync(outDir).filter((f) => f.endsWith(".md"));
        const match = syncIo.stdout.toString().match(/synced=(\d+)/);
        expect(match).not.toBeNull();
        const syncedCount = Number(match![1]);

        // Synced count must match the actual file count on disk
        expect(syncedCount).toBe(filesOnDisk.length);
      });
    });
  });
});
