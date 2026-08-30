# TASK: TDD RED phase — scaffold cmd-pallet CLI repo, write ALL failing tests. NO production implementation.

You are in /home/bhd/Documents/Projects/bhd/cmd-pallet (fresh empty dir). Create a NEW git repo here.

READ FIRST (absolute paths):
- /home/bhd/Documents/Projects/bhd/pi-cmd-palette/flow/plans/cmd-pallet-cli.md (THE PLAN — 30 declarative items; your tests must cover every item)
- /home/bhd/Documents/Projects/bhd/pi-cmd-palette/flow/plans/cmd-pallet-cli-gotcha.md (hardened contracts — pin them in tests)
- /home/bhd/Documents/Projects/bhd/.grok/plugins/_adapter-core/catalog.cjs + interpolate.cjs + fuzzy.cjs (reference semantics: findCommand, formatRead, interpolate, searchCommands ranking name×3/desc×2/body×1)
- /home/bhd/Documents/Projects/bhd/pi-unify-cmd/extensions/{config,discovery}.ts (catalog source — pure TS, node:* imports only)

SCAFFOLD (minimal, per plan):
- git init -b main; package.json: name cmd-pallet, type module, bin.cmd-pallet, engines.node>=22.18, devDeps vitest+typescript, dependency pi-unify-cmd = github:buihongduc132/pi-unify-cmd
- bin/cmd-pallet.js launcher (.js wrapper setting NODE_OPTIONS=--experimental-strip-types then import ../src/cli.ts)
- tsconfig.json: erasableSyntaxOnly, verbatimModuleSyntax, allowImportingTsExtensions, module nodenext, noEmit
- vitest.config.ts
- .gitignore (node_modules), LICENSE (MIT), README stub
- src/ STUBS ONLY (empty exports that throw "not implemented") + tests/ with FULL failing test suite

TESTS TO WRITE (all initially RED; fixture catalog in tests/fixtures/catalog/):
1. dispatch: list (no query → all; query → fuzzy ranked), read (hint line, slash/__-tolerant, dup-name → candidates + exit 1), run (Invoked: /name args + $ARGUMENTS/$1..$9/$@ substitution, quoted-arg contract), search≡list-format-identical, get≡read-format-identical, ping (ok + real config paths; load failure → structured fault + exit≠0), sync (writes frontmatter md, synced=<n>, orphan cleanup, collision error, skipped warn, --dry-run), help (loads NO catalog, lists every verb + env vars, VERBS-table driven), unknown verb → usage + exit 2
2. flag-parsing: --json before/after positional; `--` end-of-flags
3. json-flag: every verb --json shape; errors = {"error":...} + exit 1; diagnostics → stderr; exit table 0/1/2
4. interpolate-safe: replacer fns; $& $' $$ regression
5. fuzzy: best-field-max ranking weights 3/2/1
6. catalog-env: PI_CODING_AGENT_DIR honored
7. smoke-fixture: default fixture catalog; structural invariants only
8. test-isolation: per-test tmpdir env, TTL=0

RUN: npm install && npx vitest run → EXPECT ALL RED (failing, not erroring on missing imports — stubs exist).
COMMIT: "RED: full failing test suite for cmd-pallet CLI (30 plan items)" — do NOT push, do NOT create gh repo yet.

Output: summary of scaffold layout + test count + confirmation all red.
