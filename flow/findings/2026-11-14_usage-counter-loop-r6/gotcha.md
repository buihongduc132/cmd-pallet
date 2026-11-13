---
title: usage-counter loop r6 — gotcha
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: 56ea2c9a5637065fb5162e2bfcc417b18aead256
reviewer: codex exec read-only 01a1d670-96d9-74b2-8205-a1d9c3d81ac6
---

| id | rank 1-5 | trigger | wrong result | safeguard | assertion that fails today | resolved-in-plan? yes(where)/NO |
|---|---:|---|---|---|---|---|
| G1 | 3 | Worker spawn fails | Debounce stamp suppresses retries without a worker running | Stamp only after successful spawn | Make `spawnImpl` throw; assert a second call within the window spawns | yes(Task 3: spawn-failure case) |
| G2 | 3 | Stats reads malformed nested data or invalid counts | Invalid rows contribute to totals | Validate schema and counts; warn and skip the whole file | Feed the malformed `hostA` example; assert warning and zero contribution | yes(Task 5: file acceptance rules and malformed-data case) |
| G3 | 3 | User invokes the published CLI entrypoint | `runCli` tests pass while executable wiring fails to record usage | Test the spawned binary with an isolated store | Run `bin/cmd-pallet.js list`; assert one persisted count and matching output | yes(Task 2: spawned-binary case) |
| G4 | 3 | `main` upstream changes before merge | Worker merges from an unapproved upstream | Re-run all guards immediately before merge | Change upstream in `beforeMerge`; assert no merge or push | yes(Task 3: step 4 guard recheck and test) |
| G5 | 4 | Two machines resolve the same host identity | They share host files; git merge can conflict or lose counts | Detect collision and stop sync; allow a unique host override | In two clones with the same host, assert collision is logged, no merge occurs, and each count remains; retry with a unique host and assert both files reach remote | yes(Data contract and Task 3: collision handling and two-clone case) |
| G6 | 3 | A writer holds `usage/.lock` longer than 10 seconds | Another invocation removes a live lock; concurrent read-modify-write can lose an increment | Verify the lock owner is dead before removal, or renew ownership; age alone must not mark a live lock stale | Hold the first writer inside its critical section past 10 seconds, run a second writer, and assert final count is 2 while the first owner’s lock remains | NO |
| G7 | 3 | Current sync fails after an older same-host usage commit reached remote | Task 4 can accept the old commit; Task 5 reads local data and can still show the new count | Verify the exact increment in `origin/main` and read it through `stats` in a clean second clone | Retain an older same-host remote commit, reject the current push, and assert the E2E acceptance check fails | NO |
| G8 | 2 | Stats reads a date-hour key matching the regex but containing an impossible date or hour | Invalid time data enters the aggregates | Parse and validate calendar date and hour; warn and skip the file | Feed `2026-99-99T99`; assert warning and zero contribution | NO |

OPEN_RANK3PLUS=2