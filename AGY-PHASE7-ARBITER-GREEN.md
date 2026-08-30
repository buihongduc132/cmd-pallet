# TASK: TDD GREEN — fix arbiter findings until ALL 116 tests pass. NO new tests.

Repo: /home/bhd/Documents/Projects/bhd/cmd-pallet (main @ 91ffd46; tests/arbiter-audit.test.ts 12 RED, 104 green).

FIX (tests = contract; A3-collision + A7 already green — leave):
- A1: move `typescript` from devDependencies to dependencies (prod global install must work)
- A2: list/search dedupe key = (agent,name) not name-only; on same-name-across-agents show BOTH (qualified `agent:name` in text when colliding); ping count reconciles with list --json entry count
- A3: sync skip-path warns on stderr mentioning skipped count
- A4: tests/smoke.test.ts reads CMD_PALLET_TEST_REAL_CATALOG; env unset + real absent → SKIP with distinct marker (early-return logged "SKIP:" prefix); env set → real load
- A6: loadCatalog config-missing → explicit config-missing status (NO fabricated all-agents default, NO fake configPath); ping on missing config → structured fault exit 2 (or honest empty status), never prints unverified path
- A8: sync collision keyed on (agent,slug) or qualified filenames; no silent cross-agent overwrite; synced count honest

ALSO (arbiter R2, doc/API hygiene):
- F9: CMD_PALLET_CACHE_TTL is documented but unimplemented → REMOVE from help text (src/verbs.ts) and README (do not implement a cache)
- F10: src/index.ts re-exports throwing stub discoverCommands() → remove that export

RUN: npx vitest run → 116/116 green; npx tsc --noEmit clean.
COMMIT: "fix: arbiter audit findings — prod deps, cross-agent dedupe, smoke gate, honest ping, sync collision, doc hygiene" and PUSH origin main.
Output: test counts + one-line root cause per finding.
