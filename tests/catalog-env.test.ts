import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadCatalog } from "../src/catalog.ts";
import { withTempDir, FIXTURE_ROOT } from "./helpers.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("Catalog Loader Environment Honoring", () => {
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("honors PI_CODING_AGENT_DIR override over default home directory", async () => {
    await withTempDir(async (tmpAgentDir) => {
      // Set up a custom config inside tmpAgentDir
      const agentDir = join(tmpAgentDir, "agent");
      mkdirSync(agentDir, { recursive: true });

      const customConfig = {
        agents: {
          claude: {
            enabled: true,
            globalDir: join(tmpAgentDir, "custom-claude"),
            recursive: true,
          },
        },
        custom: [],
      };
      writeFileSync(join(agentDir, "unify-cmd.json"), JSON.stringify(customConfig), "utf-8");

      // Set environment variable
      process.env.PI_CODING_AGENT_DIR = tmpAgentDir;

      const result = await loadCatalog(tmpAgentDir);
      expect(result.configPath).toContain(tmpAgentDir);
    });
  });

  it("provides multi-stage isolation between different PI_CODING_AGENT_DIR values", async () => {
    await withTempDir(async (dirA) => {
      await withTempDir(async (dirB) => {
        const agentDirA = join(dirA, "agent");
        mkdirSync(agentDirA, { recursive: true });
        writeFileSync(join(agentDirA, "unify-cmd.json"), JSON.stringify({ agents: {}, custom: [] }), "utf-8");

        const agentDirB = join(dirB, "agent");
        mkdirSync(agentDirB, { recursive: true });
        writeFileSync(join(agentDirB, "unify-cmd.json"), JSON.stringify({ agents: {}, custom: [] }), "utf-8");

        process.env.PI_CODING_AGENT_DIR = dirA;
        const resA = await loadCatalog(dirA);

        process.env.PI_CODING_AGENT_DIR = dirB;
        const resB = await loadCatalog(dirB);

        expect(resA.configPath).toContain(dirA);
        expect(resB.configPath).toContain(dirB);
        expect(resA.configPath).not.toEqual(resB.configPath);
      });
    });
  });
});
