# cmd-pallet-chain

Chain runner over [cmd-pallet](./README.md) commands — Python, entirely shell-native. Each hop invokes a cli-agent (`pi -p`, default; or `agy`) with the dynamically loaded cmd instruction, piping prior outputs down per pipe-mode. User's verbatim initial request is carried through EVERY hop.

Mandate source: `flow/findings/2026-09-05_cmd-pallet-chain-mandate.md` (user verbatim).

## Usage

```bash
bin/cmd-pallet-chain.py \
  --chain "to-pi-cmd-chained-prose,10-findings-persist,gotcha-coverage,(delegate sub agents to identify the DRY approach, scaffold the directory and files),10-plan-declarative,mqa-to-tickets,mqa-drive-plan" \
  --requirement "Given with the user requirement / request that already explored and have the solutions" \
  [--agent pi|agy] [--pipe all|one|none] [--workdir DIR] [--timeout SECS] [--dry-run] [--json]
```

## Chain items

- `cmd-name` — resolved via cmd-pallet `read`; content LOADED DYNAMICALLY at run time (never stored here).
- `(prose …)` — parenthesized literal prose hop; commas inside parens allowed; passed verbatim as the hop instruction.

## Args

| Arg | Default | Meaning |
|---|---|---|
| `--chain` | required | comma-separated hops (parens protect commas) |
| `--requirement` | required | user verbatim initial request — retained through ALL hops |
| `--agent` | `pi` | cli-agent: `pi` \| `agy` |
| `--pipe` | `all` | `all` = every previous output; `one` = most recent; `none` |
| `--dry-run` | off | probe + build prompts, print sizes, no agent invoked |
| `--json` | off | machine-readable run report |

## Prompt template (mandate-exact)

```
this is user requirement : <user input>
This is previous context : <...previous context , pipe>

<cmd pallet result , automate expand on itself>
```

## Pre-flight probe

Every cmd hop is probed via cmd-pallet before ANY agent runs. Missing → immediate error naming every failing cmd; exit 3. (Note: upstream `cmd-pallet read --json` truncates at 16,384 bytes — this runner uses the plain-text `read` and parses the header, untruncated.)

## Exit codes

`0` ok · `2` usage · `3` probe failure · `4` agent hop failure (chain aborts, report retained)

## Tests

`python3 -m pytest test/test_cmd_pallet_chain.py` — 8 tests: probe ok/missing, prose-paren parsing, pipe modes, exact template, requirement retention, agent whitelist, empty-requirement rejection.
