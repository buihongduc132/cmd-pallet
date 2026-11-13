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

## Usage Tracking

Every invocation is counted in JSON files inside this repo, so usage from all machines merges through git.

| File | Shape |
|---|---|
| `usage/<hostname>.json` | `{ "<hostname>": { "<action>": { "YYYY-MM-DDTHH": count } } }` |
| `usage/<hostname>.cmds.json` | `{ "<hostname>": { "<cmd>": { "<action>": { "YYYY-MM-DDTHH": count } } } }` — `read`, `get`, `run` only |

- `action` = verb name (`list`, `search`, `read`, `get`, `run`, `ping`, `sync`, `help`), plus `version` and `unknown`.
- `<cmd>` = resolved command name (e.g. `read claude:deploy` → `deploy`); not found/ambiguous → name as typed.
- Hour keys are UTC. One file per host, so machines never conflict in git.
- After recording, a detached background worker commits `usage/*.json` and pushes (debounced). It never slows or fails the CLI; outcome per run is in `usage/.sync-log` (gitignored).

Sync only runs when the checkout is on `main` tracking `origin/main`, with no merge/rebase/cherry-pick/bisect in progress. It commits only `usage/` paths. It does not push while `main` has someone's unpushed non-usage commits (usage stays committed locally until then).

Callouts:
- To push, the worker merges `origin/main` into the checkout (like `git pull`). Git refuses if that would overwrite uncommitted files; the worker then aborts and retries next time.
- The background `git add`/`git commit` briefly holds `.git/index.lock`; a concurrent git command in the same checkout can fail once.

| Variable | Effect |
|---|---|
| `CMD_PALLET_USAGE=0` | Disable recording and sync (the test suite sets this). |
| `CMD_PALLET_USAGE_DIR` | Store elsewhere (no git sync unless it is `<repo>/usage`). |
| `CMD_PALLET_USAGE_SYNC_MIN` | Sync debounce in minutes (default `10`; `0` = every invocation). |

## License

MIT © Buc Bui (buihongduc132)
