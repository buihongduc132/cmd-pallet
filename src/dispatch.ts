/**
 * cmd-pallet — CLI dispatcher
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { findCommand, loadCatalog } from "./catalog.ts";
import { parseArgs } from "./flags.ts";
import { formatRead, listText, runCmd } from "./format.ts";
import { searchCommands } from "./fuzzy.ts";
import { syncSlashCommands } from "./sync.ts";
import { EXIT_CODES, type IoStreams } from "./types.ts";
import { formatHelp, formatHelpJson, getVerb } from "./verbs.ts";
import { resolveUsageDir } from "./usage.ts";
import { computeStats, formatStats, isEmptyStats } from "./usage-stats.ts";

const STATS_DEFAULT_TOP = 10;

/** Parse `stats` options from positionals (`--top N`, `--top=N`, `--host H`, `--host=H`). */
function parseStatsArgs(args: string[]): { top: number; host?: string } | { error: string } {
  let top = STATS_DEFAULT_TOP;
  let host: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const m = /^--(top|host)(?:=(.*))?$/.exec(args[i]);
    if (!m) return { error: `Unexpected argument: ${args[i]}` };
    const value = m[2] ?? args[++i];
    if (value === undefined || value === "") return { error: `Missing value for --${m[1]}` };
    if (m[1] === "host") {
      host = value;
    } else {
      if (!/^\d+$/.test(value) || Number(value) < 1) return { error: `--top must be a positive integer, got: ${value}` };
      top = Number(value);
    }
  }
  return { top, host };
}

export async function dispatch(
  argv: string[],
  io?: IoStreams
): Promise<number> {
  const stdout = io?.stdout ?? process.stdout;
  const stderr = io?.stderr ?? process.stderr;
  const cwd = io?.cwd ?? process.cwd();
  const env = io?.env ?? process.env;

  const parsed = parseArgs(argv);
  const isJson = Boolean(parsed.flags.json);
  const verb = parsed.verb;
  const positional = parsed.positional;

  if (parsed.flags.help || (!verb && !parsed.flags.version)) {
    if (isJson) {
      stdout.write(JSON.stringify(formatHelpJson(), null, 2) + "\n");
    } else {
      stdout.write(formatHelp() + "\n");
    }
    return EXIT_CODES.OK;
  }

  if (parsed.flags.version) {
    if (isJson) {
      stdout.write(JSON.stringify({ name: "cmd-pallet", version: "0.1.0" }, null, 2) + "\n");
    } else {
      stdout.write("cmd-pallet v0.1.0\n");
    }
    return EXIT_CODES.OK;
  }

  const verbDef = getVerb(verb!);
  if (!verbDef) {
    if (isJson) {
      stdout.write(JSON.stringify({ error: `Unknown verb: ${verb}` }, null, 2) + "\n");
    } else {
      stderr.write(`Unknown verb: ${verb}\n\n${formatHelp()}\n`);
    }
    return EXIT_CODES.UNKNOWN_VERB;
  }

  const canonicalVerb = verbDef.name;

  if (canonicalVerb === "help") {
    if (isJson) {
      stdout.write(JSON.stringify(formatHelpJson(), null, 2) + "\n");
    } else {
      stdout.write(formatHelp() + "\n");
    }
    return EXIT_CODES.OK;
  }

  if (canonicalVerb === "stats") {
    const opts = parseStatsArgs(positional);
    if ("error" in opts) {
      if (isJson) {
        stdout.write(JSON.stringify({ error: opts.error }, null, 2) + "\n");
      } else {
        stderr.write(`${opts.error}\nUsage: ${verbDef.usage}\n`);
      }
      return EXIT_CODES.USAGE_ERROR;
    }
    const dir = resolveUsageDir(env);
    const stats = dir
      ? computeStats(dir, { ...opts, warn: (m) => stderr.write(m) })
      : { topCommands: [], byHost: [], byDateHour: [], byHourOfDay: [] };
    if (isJson) {
      stdout.write(JSON.stringify(stats, null, 2) + "\n");
    } else if (isEmptyStats(stats)) {
      const where = dir ?? "(none: linked worktree — set CMD_PALLET_USAGE_DIR)";
      stdout.write(`no usage recorded${opts.host ? ` for host ${opts.host}` : ""} in ${where}\n`);
    } else {
      stdout.write(formatStats(stats, opts.top) + "\n");
    }
    return EXIT_CODES.OK;
  }

  if (canonicalVerb === "ping") {
    try {
      const catalog = await loadCatalog(cwd, { agentDir: env.PI_CODING_AGENT_DIR });
      if (isJson) {
        stdout.write(
          JSON.stringify(
            {
              status: "ok",
              count: catalog.count,
              configPath: catalog.configPath,
            },
            null,
            2
          ) + "\n"
        );
      } else {
        stdout.write(`ok (${catalog.count} commands) config: ${catalog.configPath}\n`);
      }
      return EXIT_CODES.OK;
    } catch (err: any) {
      if (isJson) {
        stdout.write(
          JSON.stringify(
            {
              status: "error",
              error: err?.message || "Ping failed",
            },
            null,
            2
          ) + "\n"
        );
      } else {
        stderr.write(`ping failed: ${err?.message || "unknown fault"}\n`);
      }
      return EXIT_CODES.CONFIG_ERROR;
    }
  }

  if (canonicalVerb === "list" || canonicalVerb === "search") {
    try {
      const catalog = await loadCatalog(cwd, { agentDir: env.PI_CODING_AGENT_DIR });
      const query = positional.join(" ").trim();
      let commands = catalog.commands;

      if (query) {
        commands = searchCommands(commands, query);
      }

      const seen = new Set<string>();
      const deduped: typeof commands = [];
      for (const cmd of commands) {
        const agent = (cmd.source?.agent || "").toLowerCase();
        const name = (cmd.name || "").toLowerCase();
        const key = `${agent}:${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(cmd);
        }
      }
      commands = deduped;

      if (commands.length === 0) {
        if (isJson) {
          stdout.write(JSON.stringify([], null, 2) + "\n");
        } else {
          stderr.write("No matching commands found.\n");
        }
        return EXIT_CODES.NOT_FOUND;
      }

      if (isJson) {
        stdout.write(JSON.stringify(commands, null, 2) + "\n");
      } else {
        const nameCounts = new Map<string, number>();
        for (const cmd of catalog.commands) {
          const n = cmd.name.toLowerCase();
          nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
        }

        for (const cmd of commands) {
          const isColliding = (nameCounts.get(cmd.name.toLowerCase()) || 0) > 1;
          stdout.write(listText(cmd, isColliding) + "\n");
        }
      }
      return EXIT_CODES.OK;
    } catch (err: any) {
      if (isJson) {
        stdout.write(JSON.stringify({ error: err?.message || "List failed" }, null, 2) + "\n");
      } else {
        stderr.write(`Error: ${err?.message || "List failed"}\n`);
      }
      return EXIT_CODES.RUNTIME_ERROR;
    }
  }

  if (canonicalVerb === "read" || canonicalVerb === "get") {
    if (positional.length === 0) {
      if (isJson) {
        stdout.write(JSON.stringify({ error: "Missing command name" }, null, 2) + "\n");
      } else {
        stderr.write("Missing command name.\nUsage: cmd-pallet read <name> [--json]\n");
      }
      return EXIT_CODES.USAGE_ERROR;
    }

    try {
      const catalog = await loadCatalog(cwd, { agentDir: env.PI_CODING_AGENT_DIR });
      const cmdName = positional[0];
      const findResult = findCommand(catalog.commands, cmdName);
      if (io?.usage) io.usage.cmd = findResult.command?.name ?? cmdName;

      if (findResult.ambiguous) {
        const candidates = (findResult.candidates || []).map(
          (c) => `${c.source.agent}:${c.name}`
        );
        if (isJson) {
          stdout.write(
            JSON.stringify(
              {
                error: `Ambiguous command name: ${cmdName}`,
                candidates,
              },
              null,
              2
            ) + "\n"
          );
        } else {
          stderr.write(
            `Ambiguous command name "${cmdName}". Multiple candidates found:\n${candidates.map((c) => `  - ${c}`).join("\n")}\n`
          );
        }
        return EXIT_CODES.AMBIGUOUS;
      }

      if (!findResult.command) {
        if (isJson) {
          stdout.write(JSON.stringify({ error: `Command not found: ${cmdName}` }, null, 2) + "\n");
        } else {
          stderr.write(`Command not found: "${cmdName}"\n`);
        }
        return EXIT_CODES.NOT_FOUND;
      }

      const cmd = findResult.command;
      if (isJson) {
        stdout.write(
          JSON.stringify(
            {
              name: cmd.name,
              description: cmd.description,
              argumentHint: cmd.argumentHint || cmd.argument_hint,
              content: cmd.content,
              source: cmd.source,
            },
            null,
            2
          ) + "\n"
        );
      } else {
        stdout.write(formatRead(cmd) + "\n");
      }
      return EXIT_CODES.OK;
    } catch (err: any) {
      if (isJson) {
        stdout.write(JSON.stringify({ error: err?.message || "Read failed" }, null, 2) + "\n");
      } else {
        stderr.write(`Error: ${err?.message || "Read failed"}\n`);
      }
      return EXIT_CODES.RUNTIME_ERROR;
    }
  }

  if (canonicalVerb === "run") {
    if (positional.length === 0) {
      if (isJson) {
        stdout.write(JSON.stringify({ error: "Missing command name" }, null, 2) + "\n");
      } else {
        stderr.write("Missing command name.\nUsage: cmd-pallet run <name> [args...] [--json]\n");
      }
      return EXIT_CODES.USAGE_ERROR;
    }

    try {
      const catalog = await loadCatalog(cwd, { agentDir: env.PI_CODING_AGENT_DIR });
      const cmdName = positional[0];
      const cmdArgs = positional.slice(1);
      const findResult = findCommand(catalog.commands, cmdName);
      if (io?.usage) io.usage.cmd = findResult.command?.name ?? cmdName;

      if (findResult.ambiguous) {
        const candidates = (findResult.candidates || []).map(
          (c) => `${c.source.agent}:${c.name}`
        );
        if (isJson) {
          stdout.write(
            JSON.stringify(
              {
                error: `Ambiguous command: ${cmdName}`,
                candidates,
              },
              null,
              2
            ) + "\n"
          );
        } else {
          stderr.write(
            `Ambiguous command name "${cmdName}". Multiple candidates found:\n${candidates.map((c) => `  - ${c}`).join("\n")}\n`
          );
        }
        return EXIT_CODES.AMBIGUOUS;
      }

      if (!findResult.command) {
        if (isJson) {
          stdout.write(JSON.stringify({ error: `Command not found: ${cmdName}` }, null, 2) + "\n");
        } else {
          stderr.write(`Command not found: "${cmdName}"\n`);
        }
        return EXIT_CODES.NOT_FOUND;
      }

      const cmd = findResult.command;
      const { invocation, output, rendered } = runCmd(cmd, cmdArgs);

      if (isJson) {
        stdout.write(
          JSON.stringify(
            {
              command: cmd.name,
              invocation,
              args: cmdArgs.join(" "),
              output,
            },
            null,
            2
          ) + "\n"
        );
      } else {
        stdout.write(rendered + "\n");
      }
      return EXIT_CODES.OK;
    } catch (err: any) {
      if (isJson) {
        stdout.write(JSON.stringify({ error: err?.message || "Run failed" }, null, 2) + "\n");
      } else {
        stderr.write(`Error: ${err?.message || "Run failed"}\n`);
      }
      return EXIT_CODES.RUNTIME_ERROR;
    }
  }

  if (canonicalVerb === "sync") {
    const outDir = positional[0] || join(homedir(), ".grok", "plugins", "cmd-pallet", "commands");
    const isDryRun = Boolean(parsed.flags.dryRun);

    try {
      const catalog = await loadCatalog(cwd, { agentDir: env.PI_CODING_AGENT_DIR });
      const syncRes = await syncSlashCommands(outDir, cwd, {
        dryRun: isDryRun,
        commands: catalog.commands,
        stderr,
      });

      if (syncRes.skipped && syncRes.skipped > 0) {
        stderr.write(`[warn] skipped ${syncRes.skipped} invalid command(s)\n`);
      }

      if (isJson) {
        stdout.write(JSON.stringify(syncRes, null, 2) + "\n");
      } else {
        stdout.write(`synced=${syncRes.synced}\n`);
      }
      return EXIT_CODES.OK;
    } catch (err: any) {
      if (isJson) {
        stdout.write(
          JSON.stringify(
            {
              status: "error",
              error: err?.message || "Sync failed",
            },
            null,
            2
          ) + "\n"
        );
      } else {
        stderr.write(`sync error: ${err?.message || "Sync failed"}\n`);
      }
      return EXIT_CODES.RUNTIME_ERROR;
    }
  }

  return EXIT_CODES.OK;
}
