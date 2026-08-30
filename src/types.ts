/**
 * cmd-pallet — core type definitions
 */

export interface ExternalCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  argument_hint?: string;
  content: string;
  source: CommandSource;
}

export interface CommandSource {
  agent: string;
  scope: "global" | "project";
  filePath: string;
}

export interface VerbDefinition {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  acceptsJson?: boolean;
}

export interface CliFlags {
  json?: boolean;
  dryRun?: boolean;
  help?: boolean;
  version?: boolean;
  [key: string]: unknown;
}

export interface ParsedArgs {
  verb?: string;
  positional: string[];
  flags: CliFlags;
  rawArgs: string[];
}

export interface SyncOptions {
  dryRun?: boolean;
  commands?: ExternalCommand[];
}

export interface SyncResult {
  status: "ok" | "error";
  synced: number;
  files: string[];
  removed?: string[];
  skipped?: number;
  configPath?: string;
}

export interface PingResult {
  status: "ok" | "error";
  count: number;
  configPath: string;
  error?: string;
}

export interface RunResult {
  command: string;
  invocation: string;
  args: string;
  output: string;
}

export interface FindResult {
  command?: ExternalCommand;
  candidates?: ExternalCommand[];
  ambiguous?: boolean;
}

export interface CatalogOptions {
  agentDir?: string;
  cacheTtl?: number;
}

export interface CatalogResult {
  commands: ExternalCommand[];
  configPath: string;
  count: number;
}

export interface IoStreams {
  stdout?: { write: (s: string) => void };
  stderr?: { write: (s: string) => void };
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export const EXIT_CODES = {
  OK: 0,
  RUNTIME_ERROR: 1,
  NOT_FOUND: 1,
  AMBIGUOUS: 1,
  COLLISION: 1,
  USAGE_ERROR: 2,
  UNKNOWN_VERB: 2,
  CONFIG_ERROR: 2,
} as const;
