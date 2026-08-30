/**
 * cmd-pallet — CLI argument and flag parser
 */

import type { CliFlags, ParsedArgs } from "./types.ts";

const KNOWN_BOOLEAN_FLAGS: Record<string, keyof CliFlags> = {
  "--json": "json",
  "--dry-run": "dryRun",
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version",
};

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: CliFlags = {};
  const positional: string[] = [];
  let stopFlags = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (stopFlags) {
      positional.push(arg);
      continue;
    }

    if (arg === "--") {
      stopFlags = true;
      continue;
    }

    if (KNOWN_BOOLEAN_FLAGS[arg]) {
      const flagName = KNOWN_BOOLEAN_FLAGS[arg];
      flags[flagName] = true;
      continue;
    }

    positional.push(arg);
  }

  let verb: string | undefined;
  let remainingPositional: string[] = [];

  if (positional.length > 0) {
    verb = positional[0];
    remainingPositional = positional.slice(1);
  }

  return {
    verb,
    positional: remainingPositional,
    flags,
    rawArgs: argv,
  };
}
