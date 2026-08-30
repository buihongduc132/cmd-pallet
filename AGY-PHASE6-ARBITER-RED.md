# TASK: TDD RED — regression tests for arbiter audit findings. NO production fixes.

Repo: /home/bhd/Documents/Projects/bhd/cmd-pallet (main @ 653924a, 103 tests green).

Independent arbiter audit found REAL defects. Write failing tests for each:

A1 [rank4] PROD INSTALL DEAD: typescript is devDependencies-only. README install = `npm install -g github:buihongduc132/cmd-pallet` → no devDeps → src/catalog.ts require("typescript") throws → every verb dead. TEST: assert package.json `dependencies` contains `typescript` (read pkg, assert present — red now).
A2 [rank4] LIST DEDUPE HIDES CROSS-AGENT CMDS: dispatch dedupes by name.toLowerCase() first-wins → claude:dup-command + codex:dup-command → 1 line. TESTS: (a) fixture w/ same name 2 agents → BOTH visible in list text (qualified or agent-prefixed on collision) and json; (b) ping count == number of json entries (reconciled).
A3 [rank4] VACUOUS TESTS: "errors and exits 1 on slug collisions" asserts nothing (if-includes guard, no colliding fixture); "warns on skipped" zero assertions. TESTS: real collision fixture (foo-bar + foo:bar) asserting exit 1 + stderr; skipped-name fixture asserting stderr warn mentions skipped count.
A4 [rank3] SMOKE FAKE GATE: CMD_PALLET_TEST_REAL_CATALOG never read; "SKIP" is bare console.log then runs unconditionally against real ~/.pi asserting /^ok/i. TESTS: env unset + real catalog absent (use PI_CODING_AGENT_DIR=tmp-empty) → smoke SKIPS with distinct marker (test.skipIf or early-return with logged SKIP: prefix asserted); env set → attempts real load only then.
A6 [rank3] CONFIG-MISSING FABRICATION + PING LIES: no config found → hardcoded default scans all agents; ping prints `config: ~/.pi/agent/unify-cmd.json` even when nonexistent. TESTS: PI_CODING_AGENT_DIR pointing to empty tmpdir → ping exits 2 with structured fault (NOT ok, NOT fake configPath) OR distinct empty-status exit code w/ honest message; catalog load reports config-missing explicitly.
A7 [rank3] FIXTURE HACK IN PROD PATH: src/catalog.ts munges `tests/fixtures` prefix in projectDir. TEST: grep-equivalent — read src/catalog.ts source, assert no literal "tests/fixtures" substring (red now).
A8 [rank3] SYNC CROSS-SOURCE OVERWRITE: collision throws only when prev!==cmd.name; same name different agent → silent overwrite + double count. TEST: sync fixture with claude:dup-command + codex:dup-command → error OR distinct files per agent + synced count honest.

RUN: npx vitest run → new tests RED (existing 103 stay green except A3's replaced vacuous ones — rewrite those IN PLACE).
COMMIT: "RED: arbiter audit findings A1,A2,A3,A4,A6,A7,A8". Do NOT push.
