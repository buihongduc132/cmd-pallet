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
    description: "Expand command template placeholders ($ARGUMENTS, $1..$9, $@)",
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
  throw new Error("not implemented: getVerb");
}

export function formatHelp(): string {
  throw new Error("not implemented: formatHelp");
}

export function formatHelpJson(): object {
  throw new Error("not implemented: formatHelpJson");
}
