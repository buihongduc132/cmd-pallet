# TASK: TDD GREEN + refactor — implement cmd-pallet CLI until FULL test suite passes. NO new tests.

You are in /home/bhd/Documents/Projects/bhd/cmd-pallet. Phase 1 (separate agent) scaffolded the repo + wrote the FULL failing test suite (committed "RED: ..."). Your job: make it green.

READ FIRST:
- ./tests/** (the contract — do NOT modify tests except to fix fixture-path bugs)
- /home/bhd/Documents/Projects/bhd/pi-cmd-palette/flow/plans/cmd-pallet-cli.md (30 items)
- /home/bhd/Documents/Projects/bhd/pi-cmd-palette/flow/plans/cmd-pallet-cli-gotcha.md (hardened contracts)
- /home/bhd/Documents/Projects/bhd/.grok/plugins/_adapter-core/{catalog.cjs,interpolate.cjs,fuzzy.cjs} — reference semantics to port
- /home/bhd/Documents/Projects/bhd/pi-unify-cmd/extensions/{config.ts,discovery.ts} — catalog source (dependency github:buihongduc132/pi-unify-cmd already declared)

IMPLEMENT:
- src/catalog.ts: load via pi-unify-cmd discovery (plain --experimental-strip-types import; NO shims); honor PI_CODING_AGENT_DIR before loadConfig
- src/fuzzy.ts: best-field-max (name×3/desc×2/body×1), boundary/consecutive/prefix bonuses
- src/interpolate.ts: $ARGUMENTS/$@ raw-argv-remainder join; $1..$9 whitespace split; REPLACER FUNCTIONS ($&-safe)
- src/format.ts: listText (name\tdesc), formatRead (# name + argument-hint + content), runCmd (Invoked: /name args + interpolated)
- src/sync.ts: frontmatter writer + orphan cleanup + collision error + skipped warn + --dry-run + write-if-changed
- src/dispatch.ts: single VERBS table drives help+dispatch; flag-filter before positional; `--` end-of-flags; --json everywhere; errors {"error":...}+exit 1; diagnostics stderr; exit table 0 ok/1 no-match/2 config-deps; help loads NO catalog; ping catches load failure → structured fault + exit 2
- src/cli.ts: entry wiring
- README.md: usage + trust chain + cmd-pallet vs cmd-palette distinction + run=materialize-not-execute

RUN: npm install && npx vitest run && npx tsc --noEmit → ALL GREEN, 0 fail.
COMMIT: "GREEN: implement cmd-pallet CLI to full test suite" — do NOT push yet.

Output: test summary (passed/total), files created, any plan-item gaps found (list item ids).
