/**
 * cmd-pallet — catalog loader and command discovery
 */

import type {
  CatalogOptions,
  CatalogResult,
  ExternalCommand,
  FindResult,
} from "./types.ts";

export function grokCommandName(name: string): string {
  throw new Error("not implemented: grokCommandName");
}

export function slashMarkdown(cmd: ExternalCommand): string {
  throw new Error("not implemented: slashMarkdown");
}

export function formatRead(cmd: ExternalCommand): string {
  throw new Error("not implemented: formatRead");
}

export function findCommand(
  commands: ExternalCommand[],
  name: string
): FindResult {
  throw new Error("not implemented: findCommand");
}

export async function loadCatalog(
  cwd?: string,
  options?: CatalogOptions
): Promise<CatalogResult> {
  throw new Error("not implemented: loadCatalog");
}

export function discoverCommands(
  config: unknown,
  cwd: string
): ExternalCommand[] {
  throw new Error("not implemented: discoverCommands");
}
