---
title: usage-counter loop r4 — gotcha
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: f0f53d86c65fbf2a88e3ae0d32fc7463e508ea2f
---

| id | rank 1-5 | trigger | wrong result | safeguard | assertion that fails today | resolved-in-plan? yes(where)/NO |
|---|---:|---|---|---|---|---|
| G1 | 3 | Worker spawn fails after `.sync-stamp` is written | Later invocations skip sync for the debounce window despite no worker running | Clear the stamp on spawn failure, or only stamp after confirmed spawn | Force `spawnImpl` to throw; assert a second call within the window spawns a worker | NO |
| G2 | 3 | Stats reads a valid JSON object with malformed nested data or invalid counts | Bad rows are silently included in totals; “malformed file” handling only checks JSON syntax and top-level object shape | Validate filename/host agreement, schema depth, date-hour keys, and positive integer counts; warn and skip invalid files | Feed `{ "hostA": { "list": { "not-a-date": -2 } } }`; assert warning and no contribution | NO |
| G3 | 3 | The published CLI entrypoint is invoked, rather than `runCli` directly | Tests can pass while executable argument parsing or entrypoint wiring fails to record an invocation | Add an end-to-end spawned-binary case with an isolated store and read back its counter | Spawn the built/installed CLI with a temp usage dir; assert one persisted count and unchanged command output | NO |
| G4 | 3 | Shared checkout upstream changes after initial guard and fetch, before merge | Worker may merge a different upstream than the required `origin/main` | Recheck upstream identity with the other step-0 guards immediately before merge | Change `main`’s upstream in `beforeMerge`; assert sync stops without merging or pushing | NO |

Loaded stages: plan, code/integration, test/verification, deploy/release. Applicable lesson IDs: PLAN-01–13, CODE-01–06, TEST-01–08, DEPLOY-01–05. Plan edge cases already listed were treated as context and not repeated.

OPEN_RANK3PLUS=4
