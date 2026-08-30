# cmd-pallet

Unified CLI for slash command palettes across AI coding agents (Claude Code, OpenCode, Codex, Gemini CLI).

> **Note on `run`:** `cmd-pallet run` prints the expanded invocation with substituted variables (`$ARGUMENTS`, `$1..$9`, `$@`); it does **not** execute arbitrary shell commands.
>
> **cmd-pallet vs cmd-palette:** `cmd-pallet` is the standalone CLI binary for querying, reading, running, and syncing unified commands across multiple AI coding agents. For pi prompts/skills interactive TUI palette, see `cmd-palette`.

## Trust Chain

`cmd-pallet` builds on `pi-unify-cmd` (`github:buihongduc132/pi-unify-cmd`) for pure TypeScript command discovery and configuration loading, bringing full parity with the `pi-cmd-palette` adapter ecosystem.

## Verbs

- `cmd-pallet list [query]` — List all or fuzzy-search commands (ranked by name × 3, description × 2, body × 1)
- `cmd-pallet search <query>` — Alias for `list <query>`
- `cmd-pallet read <name>` — Display full command markdown with argument hints
- `cmd-pallet get <name>` — Alias for `read <name>`
- `cmd-pallet run <name> [args...]` — Expand command template with arguments (`$ARGUMENTS`, `$1..$9`, `$@`)
- `cmd-pallet ping` — Check catalog status, configuration path, and discovered command count
- `cmd-pallet sync [outdir]` — Sync commands as frontmatter markdown files (supports `--dry-run`, orphan cleanup)
- `cmd-pallet help` — Display CLI usage and environment variables (pure static, loads no catalog)

All query/data verbs support `--json` output.

## Environment Variables

- `PI_CODING_AGENT_DIR` — Root configuration directory for agent discovery (overrides default `~/.pi`)
- `CMD_PALLET_CACHE_TTL` — Cache TTL in seconds (default `0`)

## Installation

```bash
npm install -g github:buihongduc132/cmd-pallet
```

Requires Node.js `>=22.18`.

## License

MIT © Buc Bui (buihongduc132)
