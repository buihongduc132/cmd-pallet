---
title: usage-counter loop r5 — gotcha
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: 00bd7f9c3b4664ace87468faf235c2032228d540
reviewer: codex gpt-6-luna exec read-only 01a1d66b-cb96-78d3-b1b2-90d2f0352b7c
---

| id | rank 1-5 | trigger | wrong result | safeguard | assertion that fails today | resolved-in-plan? yes(where)/NO |
|---|---:|---|---|---|---|---|
| G1 | 3 | Worker spawn fails | Debounce stamp suppresses retries although no worker is running | Write stamp only after spawn succeeds | Make `spawnImpl` throw; assert a second call within the window spawns | yes(Task 3: stamp only after successful spawn; RED spawn-failure case) |
| G2 | 3 | Stats reads valid JSON with malformed nested data or invalid counts | Invalid rows contribute to totals | Validate host, depth, date-hour keys, and positive safe-integer counts; warn and skip the file | Feed the malformed `hostA` example; assert warning and zero contribution | yes(Task 5: file acceptance rules and RED malformed-data case) |
| G3 | 3 | User invokes the published CLI entrypoint | `runCli` tests pass while executable wiring fails to record usage | Spawn the CLI with an isolated store and verify persisted count and unchanged output | Run `bin/cmd-pallet.js list`; assert one persisted count and matching output | yes(Task 2: spawned-binary RED case) |
| G4 | 3 | `main` upstream changes after initial guard and before merge | Worker merges from an unapproved upstream | Re-run all guards immediately before merge | Change upstream in `beforeMerge`; assert no merge or push | yes(Task 3, step 4: full guard recheck and RED case) |
| TL-1 | 3 | Different agents have a command with the same name | Stats combines distinct commands into one row | Store and aggregate by agent-qualified key | Record `a1:x` and `a2:x`; assert separate stats rows | yes(Data contract and Tasks 2/5: qualified key and duplicate-name cases) |
| G5 | 4 | Two machines have the same `os.hostname()` and record usage | They edit the same host files; git merge can conflict or lose counts | Use a per-machine unique identity, or detect collisions and prevent shared-file writes | In two clones with the same hostname, record and sync concurrently; assert both counts survive without conflict | NO |

OPEN_RANK3PLUS=1
