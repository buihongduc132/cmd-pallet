/**
 * cmd-pallet — sync commands to directory as frontmatter markdown
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { grokCommandName, loadCatalog, slashMarkdown } from "./catalog.ts";
import type { SyncOptions, SyncResult } from "./types.ts";

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

  const writtenFiles: string[] = [];
  const writtenNames = new Set<string>();
  const seenOriginalNames = new Map<string, string>();
  let skipped = 0;

  for (const cmd of commands) {
    const slug = grokCommandName(cmd.name);
    if (!slug) {
      process.stderr.write(`[warn] Skipped command with invalid name: "${cmd.name}"\n`);
      skipped++;
      continue;
    }

    if (writtenNames.has(slug)) {
      const prev = seenOriginalNames.get(slug);
      if (prev && prev !== cmd.name) {
        throw new Error(`Slug collision detected: commands "${prev}" and "${cmd.name}" both resolve to slug "${slug}"`);
      }
    }

    writtenNames.add(slug);
    seenOriginalNames.set(slug, cmd.name);

    const filePath = join(outDir, `${slug}.md`);
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
          if (!writtenNames.has(stem)) {
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
