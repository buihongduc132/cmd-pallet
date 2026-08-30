import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyRankMulti, searchCommands } from "../src/fuzzy.ts";
import type { ExternalCommand } from "../src/types.ts";

describe("Fuzzy Scoring and Ranking", () => {
  describe("fuzzyScore", () => {
    it("returns score > 0 for sequential character match", () => {
      expect(fuzzyScore("dep", "deploy")).toBeGreaterThan(0);
      expect(fuzzyScore("dpl", "deploy")).toBeGreaterThan(0);
    });

    it("returns 0 when query characters do not match in sequence", () => {
      expect(fuzzyScore("xyz", "deploy")).toBe(0);
      expect(fuzzyScore("ped", "deploy")).toBe(0);
    });

    it("is case-insensitive", () => {
      expect(fuzzyScore("DEPLOY", "deploy")).toBe(fuzzyScore("deploy", "deploy"));
      expect(fuzzyScore("deploy", "DEPLOY")).toBeGreaterThan(0);
    });

    it("awards leading bonus and consecutive bonus", () => {
      const scoreConsecutive = fuzzyScore("dep", "deploy");
      const scoreSeparated = fuzzyScore("dep", "deep-copy");
      expect(scoreConsecutive).toBeGreaterThan(scoreSeparated);
    });

    it("awards boundary bonus at separators (-, _, /, space)", () => {
      const scoreBoundary = fuzzyScore("pr", "bkfw-pr-resolve");
      const scoreNonBoundary = fuzzyScore("pr", "approve");
      expect(scoreBoundary).toBeGreaterThan(scoreNonBoundary);
    });

    it("returns 1 for empty query", () => {
      expect(fuzzyScore("", "anything")).toBe(1);
    });
  });

  describe("fuzzyRankMulti with Best-Field-Max (3/2/1 weights)", () => {
    const mockCommands: ExternalCommand[] = [
      {
        name: "deploy",
        description: "Deploy current branch",
        content: "Run deployment pipeline",
        source: { agent: "claude", scope: "project", filePath: "/path1" },
      },
      {
        name: "builder",
        description: "deploy helper tool",
        content: "Compile and build project",
        source: { agent: "opencode", scope: "project", filePath: "/path2" },
      },
      {
        name: "checker",
        description: "Code validator",
        content: "deploy validation logic",
        source: { agent: "codex", scope: "project", filePath: "/path3" },
      },
      {
        name: "unrelated",
        description: "Unrelated utility",
        content: "Other content",
        source: { agent: "gemini", scope: "project", filePath: "/path4" },
      },
    ];

    it("ranks name match (weight 3) highest when query matches all three fields", () => {
      const results = searchCommands(mockCommands, "deploy");
      expect(results.length).toBe(3);
      // Name match should be ranked 1st
      expect(results[0].name).toBe("deploy");
      // Description match should be ranked 2nd
      expect(results[1].name).toBe("builder");
      // Content match should be ranked 3rd
      expect(results[2].name).toBe("checker");
    });

    it("returns all items in original order for empty query", () => {
      const results = searchCommands(mockCommands, "");
      expect(results).toEqual(mockCommands);

      const whitespaceResults = searchCommands(mockCommands, "   ");
      expect(whitespaceResults).toEqual(mockCommands);
    });

    it("returns empty array when no field matches query", () => {
      const results = searchCommands(mockCommands, "nonexistent999");
      expect(results).toEqual([]);
    });
  });
});
