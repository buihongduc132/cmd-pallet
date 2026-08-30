# cmd-pallet

Unified CLI for slash command palettes across AI coding agents (Claude Code, OpenCode, Codex, Gemini CLI).

> **Note on `run`:** `cmd-pallet run` prints the expanded invocation with substituted variables (`$ARGUMENTS`, `$1..$9`, `$@`); it does **not** execute arbitrary shell commands.

## Distinction

| Component / Tool | Interface | Scope & Purpose | Execution Model |
| :--- | :--- | :--- | :--- |
| **`cmd-pallet`** | Headless CLI (`cmd-pallet <verb>`) | Standalone CLI for querying, inspecting, expanding, and syncing commands across agents | Expands and materializes templates to `stdout` (safe text interpolation) |
| **`cmd-palette`** | Interactive TUI | Interactive prompt and skill selection palette within the Pi session | Injects selected prompt/command into the active Pi session |
| **`pi-unify-cmd`** | TypeScript Library | Pure TypeScript discovery engine and parser for unified agent configurations | Programmatic AST / schema discovery |

## Trust Chain

`cmd-pallet` is engineered for safety, deterministic behavior, and multi-agent interoperability:

- **Pure TypeScript Engine:** Built on `pi-unify-cmd` (`github:buihongduc132/pi-unify-cmd`) using native `node:*` modules and TypeScript strip-types runtime without heavy or native binaries.
- **Safe Template Interpolation:** Parameter substitution for `$ARGUMENTS`, `$1..$9`, and `$@` uses replacer functions to prevent `$1..$9`, `$&`, `$'`, and `$$` regex capture injection bugs.
- **Strict Exit Codes:**
  - `0`: Success
  - `1`: Domain error (command not found, ambiguous match)
  - `2`: Usage error or configuration/dependency load failure
- **Clean Output Streams:** Data and structured JSON payloads are sent strictly to `stdout`, while warnings, errors, and diagnostic messages are routed to `stderr`.

## Installation

Install globally directly via GitHub:

```bash
npm install -g github:buihongduc132/cmd-pallet
```

*Prerequisite: Node.js `>=22.18`.*

## Usage per Verb

### `ping`
Verify catalog connectivity, configuration path, and total discovered command count.
```bash
cmd-pallet ping
cmd-pallet ping --json
```

### `list`
List all discovered commands or perform ranked fuzzy matching against command names (×3), descriptions (×2), and prompt bodies (×1).
```bash
cmd-pallet list
cmd-pallet list commit
cmd-pallet list --json
```

### `search`
Alias for `list <query>`.
```bash
cmd-pallet search review
cmd-pallet search review --json
```

### `read`
Display the full command markdown definition, including header and argument hints. Tolerates leading `/` or `__` prefixes.
```bash
cmd-pallet read commit
cmd-pallet read /commit
cmd-pallet read --json commit
```

### `get`
Alias for `read <name>`.
```bash
cmd-pallet get review
cmd-pallet get --json review
```

### `run`
Safely expand command template parameters (`$ARGUMENTS`, `$1..$9`, `$@`) with provided arguments and output the materialized prompt to stdout.
```bash
cmd-pallet run commit "feat: add user auth"
cmd-pallet run --json commit "feat: add user auth"
```

### `sync`
Sync discovered slash commands to frontmatter markdown files in a target directory (supports orphan cleanup and `--dry-run`).
```bash
cmd-pallet sync ~/.commands/
cmd-pallet sync ~/.commands/ --dry-run
cmd-pallet sync ~/.commands/ --json
```

### `help`
Display static CLI usage, verb table, and environment variables without loading the catalog.
```bash
cmd-pallet help
cmd-pallet help --json
```

## Environment Variables

- `PI_CODING_AGENT_DIR` — Root configuration directory for agent discovery (overrides default `~/.pi`).
- `CMD_PALLET_CACHE_TTL` — Cache TTL in seconds (default `0`).

## License

MIT © Buc Bui (buihongduc132)
