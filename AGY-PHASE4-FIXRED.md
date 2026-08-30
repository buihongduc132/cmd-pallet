# TASK: TDD RED — regression tests for 3 live-verified defects. NO production fix.

Repo: /home/bhd/Documents/Projects/bhd/cmd-pallet (main @ e58663b, all 84 tests green).

Live defects found by parent verification against REAL catalog (~/.pi/agent/unify-cmd.json, 1050 commands incl. scope-qualified dups codex:10-ospx-explore / gemini:10-ospx-explore / pi:10-ospx-explore):

D1 QUALIFIED-NAME UNRESOLVABLE: `cmd-pallet read pi:10-ospx-explore` → "Command not found" even though ambiguity candidates for `10-ospx-explore` list exactly `pi:10-ospx-explore`. Candidate names printed MUST be directly resolvable.
D2 EXIT-CODE VIOLATION: `cmd-pallet read <missing>` / `run <missing>` exit 0. Contract: not-found/no-match → exit 1; usage → 2; ok → 0. Bin-level (bin/cmd-pallet.js path), not just dispatch fn.
D3 DUPLICATES IN OUTPUT: `cmd-pallet search deploy` prints `deploy-pi-sync-back` 3× (same command). list/search must dedupe by unique command identity across scope copies (or print each scope ONCE — pick: dedupe identical name+content, keep first).

WRITE failing tests (tests/regression-defects.test.ts + extend existing where fitting):
- read/run with EXACT qualified candidate name (from ambiguity list) resolves and prints content/Invoked
- missing name → process exit code 1 (spawn bin or assert exitCode propagation from cli entry)
- ambiguous name → candidates listed + exit 1 (per plan output-contract)
- search/list output contains NO duplicate lines for same command name
RUN: npx vitest run → new tests RED, existing 84 stay green.
COMMIT: "RED: regression tests for qualified-name, exit-codes, dupes". Do NOT push.
