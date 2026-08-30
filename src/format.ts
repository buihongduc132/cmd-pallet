/**
 * cmd-pallet — output formatters (list, read, run)
 */

import type { ExternalCommand } from "./types.ts";
import { buildInvocation, interpolate } from "./interpolate.ts";

export function listText(cmd: ExternalCommand): string {
  return `${cmd.name}\t${cmd.description || ""}`;
}

export function formatRead(cmd: ExternalCommand): string {
  const hint = cmd.argumentHint || cmd.argument_hint || "";
  const hintLine = hint ? `argument-hint: ${hint}\n` : "";
  return `# ${cmd.name}\n${hintLine}\n${cmd.content}`;
}

export function runCmd(
  cmd: ExternalCommand,
  args: string[] | string
): { invocation: string; output: string; rendered: string } {
  const argStr = Array.isArray(args) ? args.join(" ") : String(args || "");
  const invocation = buildInvocation(cmd.name, argStr);
  const output = interpolate(cmd.content, args);
  const rendered = `Invoked: ${invocation}\n\n${output}`;
  return { invocation, output, rendered };
}
