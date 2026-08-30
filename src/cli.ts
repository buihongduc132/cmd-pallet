/**
 * cmd-pallet — CLI entry point and dispatcher
 */

import { dispatch } from "./dispatch.ts";
import type { IoStreams } from "./types.ts";

export async function runCli(
  argv: string[],
  io?: IoStreams
): Promise<number> {
  return dispatch(argv, io);
}

export async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
