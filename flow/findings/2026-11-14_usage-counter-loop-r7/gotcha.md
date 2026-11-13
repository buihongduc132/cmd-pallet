---
title: usage-counter loop r7 — gotcha
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: 1d245b3cbf7b99d38098efc4f62b3be5980840cd
reviewer: codex exec read-only 01a1d675-4a94-7c91-b9d1-05f05af4ffe1
---

| id | rank 1-5 | trigger | wrong result | safeguard | assertion that fails today | resolved-in-plan? yes(where)/NO |
|---|---:|---|---|---|---|---|
| G1 | 3 | Worker spawn fails | Debounce stamp suppresses retries without a worker | Write the stamp only after spawn succeeds | Make `spawnImpl` throw; assert a second call within the debounce window spawns | yes(Task 3: spawn-failure case) |
| G2 | 3 | Stats reads malformed nested data or invalid counts | Invalid rows contribute to totals | Validate the whole file; warn and skip it on any violation | Feed malformed `hostA` data; assert warning and zero contribution | yes(Task 5: file acceptance rules and malformed-data case) |
| G3 | 3 | User invokes the published CLI entrypoint | `runCli` tests pass while executable wiring fails to record usage | Test the spawned binary with an isolated store | Run `bin/cmd-pallet.js list`; assert one persisted count and matching output | yes(Task 2: spawned-binary case) |
| G4 | 3 | `main` upstream changes before merge | Worker merges from an unapproved upstream | Re-run all guards immediately before merge | Change upstream in `beforeMerge`; assert no merge or push | yes(Task 3: step 4 guard recheck and test) |
| G5 | 4 | Two machines resolve to the same hostname | Shared files can conflict or lose counts | Sum per-leaf deltas using a merge driver | Two clones record under `same`; assert summed remote counts, no conflict markers, and both checkouts converge | yes(Data contract and Task 3: sum merge driver and same-host case) |
| G6 | 3 | A writer holds a usage lock longer than the stale threshold | Another invocation removes a live lock and loses an increment | Break a lock only when its PID is dead; apply the same owned-lock helper to store and sync locks | Hold a live lock past the threshold; assert it remains and final count is 2 | yes(Task 1 and Task 3: owned-lock rules and cases) |
| G7 | 3 | An older same-host usage commit is already on the remote | E2E accepts that commit while the current increment never reaches the remote | Compare the remote count against its pre-run value and require a post-start commit; read stats in a clean clone | Keep an older remote commit, reject the current push; assert Task 4/5 acceptance fails | yes(Task 4: baseline plus post-`T0` commit; Task 5: clean-clone stats) |
| G8 | 2 | Stats reads a regex-matching but impossible date-hour | Invalid time data enters aggregates | Validate that the key round-trips as a real UTC date-hour | Feed `2026-99-99T99` and `2026-02-30T00`; assert warning and zero contribution | yes(Task 5: calendar validation and invalid-date cases) |
| G9 | 3 | Another same-host invocation syncs during Task 4 E2E | Its increment and commit can satisfy the `A ≥ B + 1` and post-`T0` checks, masking failure of the tested invocation | Attribute the remote delta to the tested invocation, or isolate the E2E from concurrent writers | Suppress the tested invocation’s sync while a concurrent same-host invocation increments and syncs; assert Task 4 incorrectly passes | NO |
OPEN_RANK3PLUS=1