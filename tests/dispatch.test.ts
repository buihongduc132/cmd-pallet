import { describe, it, expect, beforeEach } from "vitest";
import { runCli } from "../src/cli.ts";
import { VERBS } from "../src/verbs.ts";
import { createMockIo, FIXTURE_ROOT, withTempDir } from "./helpers.ts";
import { writeFileSync, existsSync, readFileSync, readdirSync, utimesSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("CLI Dispatch", () => {
  let io: ReturnType<typeof createMockIo>;

  beforeEach(() => {
    io = createMockIo();
  });

  describe("list verb", () => {
    it("lists all commands when no query is provided", async () => {
      const exitCode = await runCli(["list"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("deploy");
      expect(out).toContain("review");
      expect(out).toContain("explain");
      expect(out).toContain("ask");
    });

    it("fuzzy filters commands when a query is provided", async () => {
      const exitCode = await runCli(["list", "deploy"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("deploy");
      expect(out).not.toContain("summarize");
    });

    it("returns exit code 1 when no matching command is found in search", async () => {
      const exitCode = await runCli(["list", "nonexistent-xyz-query-12345"], io);
      expect(exitCode).toBe(1);
      expect(io.stderr.toString() + io.stdout.toString()).toMatch(/no (matching )?commands/i);
    });
  });

  describe("read verb", () => {
    it("renders command with header, argument-hint, and body", async () => {
      const exitCode = await runCli(["read", "deploy"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("# deploy");
      expect(out).toContain("argument-hint: <env> [flags]");
      expect(out).toContain("echo \"Deploying branch to $1");
    });

    it("does not leak frontmatter '---' block into stdout", async () => {
      const exitCode = await runCli(["read", "deploy"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString().trim();
      expect(out.startsWith("---")).toBe(false);
      expect(out).not.toContain("description: \"Deploy current branch");
    });

    it("is slash-tolerant (/deploy -> deploy)", async () => {
      const exitCode = await runCli(["read", "/deploy"], io);
      expect(exitCode).toBe(0);
      expect(io.stdout.toString()).toContain("# deploy");
    });

    it("is double-underscore and dash tolerant (bkfw-pr-resolve / bkfw__pr-resolve)", async () => {
      const exitCode = await runCli(["read", "bkfw-pr-resolve"], io);
      expect(exitCode).toBe(0);
      expect(io.stdout.toString()).toContain("pr-resolve");
    });

    it("detects duplicate/ambiguous names and outputs candidate list with exit 1", async () => {
      const exitCode = await runCli(["read", "dup-command"], io);
      expect(exitCode).toBe(1);
      const err = io.stderr.toString() + io.stdout.toString();
      expect(err).toMatch(/ambiguous|multiple candidates/i);
      expect(err).toContain("claude");
      expect(err).toContain("codex");
    });

    it("exits with error when command name is missing", async () => {
      const exitCode = await runCli(["read"], io);
      expect(exitCode).toBeGreaterThanOrEqual(1);
      expect(io.stderr.toString()).toMatch(/missing command name|usage/i);
    });

    it("exits with 1 when command does not exist", async () => {
      const exitCode = await runCli(["read", "nonexistent-cmd-999"], io);
      expect(exitCode).toBe(1);
      expect(io.stderr.toString() + io.stdout.toString()).toMatch(/not found/i);
    });
  });

  describe("run verb", () => {
    it("prints 'Invoked: /<name> <args>' and interpolated body", async () => {
      const exitCode = await runCli(["run", "deploy", "staging", "--force"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("Invoked: /deploy staging --force");
      expect(out).toContain("Deploying branch to staging with options: staging --force");
    });

    it("honors quoted-arg contract preserving remainder for $ARGUMENTS and whitespace-splitting for $1..$9", async () => {
      const exitCode = await runCli(["run", "quoted-test", "hello world", "alice"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("Invoked: /quoted-test hello world alice");
      expect(out).toContain("Message: hello world alice");
      expect(out).toContain("Arg1: hello");
      expect(out).toContain("AllArgs: hello world alice");
    });

    it("exits with 1 when running nonexistent command", async () => {
      const exitCode = await runCli(["run", "nonexistent-cmd-123"], io);
      expect(exitCode).toBe(1);
      expect(io.stderr.toString() + io.stdout.toString()).toMatch(/not found/i);
    });

    it("exits with error when run has no command name", async () => {
      const exitCode = await runCli(["run"], io);
      expect(exitCode).toBeGreaterThanOrEqual(1);
    });
  });

  describe("search and get aliases", () => {
    it("search is format-identical to list with query", async () => {
      const listIo = createMockIo();
      const searchIo = createMockIo();

      await runCli(["list", "deploy"], listIo);
      await runCli(["search", "deploy"], searchIo);

      expect(searchIo.stdout.toString()).toBe(listIo.stdout.toString());
    });

    it("get is format-identical to read", async () => {
      const readIo = createMockIo();
      const getIo = createMockIo();

      await runCli(["read", "deploy"], readIo);
      await runCli(["get", "deploy"], getIo);

      expect(getIo.stdout.toString()).toBe(readIo.stdout.toString());
    });
  });

  describe("ping verb", () => {
    it("prints ok, resolved config path, and total commands count (exit 0)", async () => {
      const exitCode = await runCli(["ping"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toMatch(/^ok/i);
      expect(out).toContain("unify-cmd.json");
    });

    it("catches catalog load failures and prints structured fault to stderr (exit != 0)", async () => {
      const brokenIo = createMockIo({
        env: {
          PI_CODING_AGENT_DIR: "/nonexistent/broken/path/dir",
        },
      });
      // Ping should catch errors gracefully
      const exitCode = await runCli(["ping"], brokenIo);
      expect(exitCode).not.toBe(0);
      expect(brokenIo.stderr.toString() + brokenIo.stdout.toString()).toMatch(/fault|error|failed/i);
    });
  });

  describe("sync verb", () => {
    it("syncs frontmatter markdown files and prints synced=<n>", async () => {
      await withTempDir(async (tmp) => {
        const exitCode = await runCli(["sync", tmp], io);
        expect(exitCode).toBe(0);
        expect(io.stdout.toString()).toMatch(/synced=\d+/);

        const files = readdirSync(tmp);
        expect(files.some((f) => f.endsWith(".md"))).toBe(true);
        expect(existsSync(join(tmp, "deploy.md"))).toBe(true);

        const content = readFileSync(join(tmp, "deploy.md"), "utf-8");
        expect(content).toContain("name: deploy");
        expect(content).toContain("user-invocable: true");
      });
    });

    it("supports --dry-run without creating files on disk", async () => {
      await withTempDir(async (tmp) => {
        const exitCode = await runCli(["sync", tmp, "--dry-run"], io);
        expect(exitCode).toBe(0);
        expect(io.stdout.toString()).toMatch(/synced=\d+/);
        const files = readdirSync(tmp);
        expect(files.length).toBe(0);
      });
    });

    it("cleans up orphan files from previous sync runs", async () => {
      await withTempDir(async (tmp) => {
        const staleFile = join(tmp, "stale-deleted-cmd.md");
        writeFileSync(staleFile, "---\nname: stale\n---\nbody", "utf-8");
        expect(existsSync(staleFile)).toBe(true);

        const exitCode = await runCli(["sync", tmp], io);
        expect(exitCode).toBe(0);
        expect(existsSync(staleFile)).toBe(false);
      });
    });

    it("errors and exits with code 1 on slug name collisions", async () => {
      await withTempDir(async (tmpAgentDir) => {
        const agentDir = join(tmpAgentDir, "agent");
        const claudeDir = join(tmpAgentDir, "claude");
        mkdirSync(agentDir, { recursive: true });
        mkdirSync(claudeDir, { recursive: true });

        // When two distinct commands resolve to the same grokCommandName slug (e.g. foo-bar vs foo.bar)
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

    it("warns on stderr for skipped empty-name commands without incrementing synced count", async () => {
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

    it("implements write-only-if-changed avoiding unnecessary disk writes", async () => {
      await withTempDir(async (tmp) => {
        await runCli(["sync", tmp], io);
        const deployPath = join(tmp, "deploy.md");
        const mtimeBefore = statSync(deployPath).mtimeMs;

        // Small delay
        await new Promise((r) => setTimeout(r, 10));

        const secondIo = createMockIo();
        await runCli(["sync", tmp], secondIo);
        const mtimeAfter = statSync(deployPath).mtimeMs;

        expect(mtimeAfter).toBe(mtimeBefore);
      });
    });
  });

  describe("help verb", () => {
    it("loads NO catalog and runs safely even with broken/unreadable paths", async () => {
      const brokenIo = createMockIo({
        env: {
          PI_CODING_AGENT_DIR: "/completely/broken/invalid/dir",
        },
      });
      const exitCode = await runCli(["help"], brokenIo);
      expect(exitCode).toBe(0);
      const out = brokenIo.stdout.toString();
      expect(out).toContain("Usage:");
    });

    it("lists every verb present in the VERBS table", async () => {
      const exitCode = await runCli(["help"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();

      for (const verbName of Object.keys(VERBS)) {
        expect(out).toContain(verbName);
      }
    });

    it("documents environment variables (PI_CODING_AGENT_DIR)", async () => {
      const exitCode = await runCli(["help"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("PI_CODING_AGENT_DIR");
    });

    it("states clearly that 'run' prints expanded invocation and does not execute", async () => {
      const exitCode = await runCli(["help"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toMatch(/does not execute|prints expanded/i);
    });

    it("includes note distinguishing cmd-pallet from cmd-palette", async () => {
      const exitCode = await runCli(["help"], io);
      expect(exitCode).toBe(0);
      const out = io.stdout.toString();
      expect(out).toContain("cmd-palette");
    });
  });

  describe("unknown verbs", () => {
    it("prints usage and error to stderr and exits with code 2", async () => {
      const exitCode = await runCli(["unknownverbxyz"], io);
      expect(exitCode).toBe(2);
      expect(io.stderr.toString()).toMatch(/unknown (verb|command)/i);
    });
  });
});
