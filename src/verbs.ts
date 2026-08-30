/**
 * cmd-pallet — verb table and help formatting
 */

import type { VerbDefinition } from "./types.ts";

export const VERBS: Record<string, VerbDefinition> = {
  list: {
    name: "list",
    aliases: ["search"],
    description: "List all or fuzzy-search commands across coding agents",
    usage: "cmd-pallet list [query] [--json]",
    acceptsJson: true,
  },
  read: {
    name: "read",
    aliases: ["get"],
    description: "Read command markdown and display argument hints",
    usage: "cmd-pallet read <name> [--json]",
    acceptsJson: true,
  },
  run: {
    name: "run",
    description: "Expand command template placeholders ($ARGUMENTS, $1..$9, $@) — prints expanded invocation; does not execute",
    usage: "cmd-pallet run <name> [args...] [--json]",
    acceptsJson: true,
  },
  search: {
    name: "search",
    description: "Alias for list with query",
    usage: "cmd-pallet search <query> [--json]",
    acceptsJson: true,
  },
  get: {
    name: "get",
    description: "Alias for read <name>",
    usage: "cmd-pallet get <name> [--json]",
    acceptsJson: true,
  },
  ping: {
    name: "ping",
    description: "Verify catalog connectivity and report discovered count",
    usage: "cmd-pallet ping [--json]",
    acceptsJson: true,
  },
  sync: {
    name: "sync",
    description: "Sync discovered commands to target directory as markdown",
    usage: "cmd-pallet sync [outdir] [--dry-run] [--json]",
    acceptsJson: true,
  },
  help: {
    name: "help",
    description: "Display CLI usage and environment variables",
    usage: "cmd-pallet help [--json]",
    acceptsJson: true,
  },
};

export function getVerb(name: string): VerbDefinition | undefined {
  const lower = name.toLowerCase();
  if (VERBS[lower]) return VERBS[lower];
  for (const v of Object.values(VERBS)) {
    if (v.aliases?.includes(lower)) return v;
  }
  return undefined;
}

export function formatHelp(): string {
  const lines: string[] = [
    "cmd-pallet — Unified CLI for slash command palettes across AI coding agents",
    "",
    "Usage:",
    "  cmd-pallet <verb> [options]",
    "",
    "Verbs:",
  ];

  for (const verb of Object.values(VERBS)) {
    const aliasInfo = verb.aliases ? ` (alias: ${verb.aliases.join(", ")})` : "";
    lines.push(`  ${verb.name.padEnd(10)} ${verb.description}${aliasInfo}`);
    lines.push(`             Usage: ${verb.usage}`);
  }

  lines.push("");
  lines.push("Note on 'run':");
  lines.push("  'run' prints expanded invocation ($ARGUMENTS, $1..$9, $@) and does not execute.");
  lines.push("");
  lines.push("Environment Variables:");
  lines.push("  PI_CODING_AGENT_DIR   Override ~/.pi agent directory location for multi-stage isolation");
  lines.push("");
  lines.push("Distinction:");
  lines.push("  cmd-pallet provides unified headless CLI access across coding agents (Claude, OpenCode, Codex, Gemini).");
  lines.push("  For interactive prompt/skill palette inside Pi TUI, see cmd-palette.");

  return lines.join("\n");
}

export function formatHelpJson(): object {
  return {
    description: "cmd-pallet — Unified CLI for slash command palettes across AI coding agents",
    verbs: VERBS,
    env: {
      PI_CODING_AGENT_DIR: "Override ~/.pi agent directory location for multi-stage isolation",
    },
    distinction: "cmd-pallet is standalone CLI; cmd-palette is interactive Pi TUI extension",
  };
}
