# TASK: TDD GREEN — fix the 3 live-verified defects until ALL 103 tests pass. NO new tests.

Repo: /home/bhd/Documents/Projects/bhd/cmd-pallet (main @ 09395ec; 19 regression tests RED in tests/regression-defects.test.ts, 84 green).

FIX (tests are the contract):
- D1 qualified-name resolvable: findCommand must resolve EXACT scope-qualified names (agent:cmd, /agent:cmd) — the very candidates the ambiguity list prints
- D2 exit codes at bin level: valid → 0; missing/ambiguous/no-match → 1 (candidates still printed); usage error (missing name) → 2. Ensure bin/cmd-pallet.js propagates exit codes from cli entry (likely missing process.exitCode wiring)
- D3 dedupe: list/search text + json emit each command identity ONCE (dedupe by name+content, keep first; e.g. deploy-pi-sync-back ×3 scopes → 1 line)

RUN: npx vitest run → 103/103 green. npx tsc --noEmit → clean.
COMMIT: "fix: qualified-name resolution, exit codes, output dedup (3 live defects)" and PUSH origin main.
Output: test counts, root-cause one-liner per defect.
