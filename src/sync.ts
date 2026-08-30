/**
 * cmd-pallet — sync commands to directory as frontmatter markdown
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { grokCommandName, loadCatalog, slashMarkdown } from "./catalog.ts";
import type { ExternalCommand, SyncOptions, SyncResult } from "./types.ts";

export async function syncSlashCommands(
  outDir: string,
  cwd?: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const isDryRun = options?.dryRun ?? false;

  let commands = options?.commands;
  let configPath = "";

  if (!commands) {
    const catalog = await loadCatalog(cwd);
    commands = catalog.commands;
    configPath = catalog.configPath;
  }

  if (!isDryRun) {
    mkdirSync(outDir, { recursive: true });
  }

  const validCommands: ExternalCommand[] = [];
  let skipped = 0;

  for (const cmd of commands) {
    const slug = grokCommandName(cmd.name);
    if (!slug) {
      options?.stderr?.write(`[warn] Skipped command with invalid name: "${cmd.name}"\n`);
      skipped++;
      continue;
    }
    validCommands.push(cmd);
  }

  // Check slug collisions
  const slugMap = new Map<string, ExternalCommand[]>();
  for (const cmd of validCommands) {
    const slug = grokCommandName(cmd.name);
    const list = slugMap.get(slug) || [];
    list.push(cmd);
    slugMap.set(slug, list);
  }

  for (const [slug, list] of slugMap.entries()) {
    if (list.length > 1) {
      const seenAgents = new Set<string>();
      for (const cmd of list) {
        const agent = (cmd.source?.agent || "unknown").toLowerCase();
        if (seenAgents.has(agent)) {
          throw new Error(`Slug collision detected: multiple commands in agent "${agent}" resolve to slug "${slug}"`);
        }
        seenAgents.add(agent);
      }
    }
  }

  const writtenFiles: string[] = [];
  const writtenStems = new Set<string>();

  for (const cmd of validCommands) {
    const slug = grokCommandName(cmd.name);
    const isColliding = (slugMap.get(slug)?.length || 0) > 1;
    const fileName = isColliding
      ? `${cmd.source?.agent || "agent"}-${slug}.md`
      : `${slug}.md`;
    const stem = basename(fileName, ".md");
    writtenStems.add(stem);

    const filePath = join(outDir, fileName);
    const content = slashMarkdown(cmd);

    if (!isDryRun) {
      let needsWrite = true;
      if (existsSync(filePath)) {
        try {
          const current = readFileSync(filePath, "utf-8");
          if (current === content) {
            needsWrite = false;
          }
        } catch {
          needsWrite = true;
        }
      }

      if (needsWrite) {
        writeFileSync(filePath, content, "utf-8");
      }
    }

    writtenFiles.push(filePath);
  }

  // Orphan cleanup
  const removed: string[] = [];
  if (!isDryRun && existsSync(outDir)) {
    try {
      const entries = readdirSync(outDir);
      for (const entry of entries) {
        if (entry.endsWith(".md")) {
          const stem = basename(entry, ".md");
          if (!writtenStems.has(stem)) {
            const stalePath = join(outDir, entry);
            rmSync(stalePath, { force: true });
            removed.push(stalePath);
          }
        }
      }
    } catch {
      // Ignore read error during cleanup
    }
  }

  return {
    status: "ok",
    synced: writtenFiles.length,
    files: writtenFiles,
    removed,
    skipped,
    configPath,
  };
}
