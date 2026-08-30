/**
 * cmd-pallet — CLI entry point and dispatcher
 */

import { dispatch } from "./dispatch.ts";
import type { IoStreams } from "./types.ts";

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export async function runCli(
  argv: string[],
  io?: IoStreams
): Promise<number> {
  return dispatch(argv, io);
}

export async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
  process.exit(exitCode);
}

// Auto-run if executed directly
if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    resolve(process.argv[1]) === fileURLToPath(import.meta.url))
) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
    process.exit(1);
  });
}
