---
title: usage-counter loop r4 — tl
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: f0f53d86c65fbf2a88e3ae0d32fc7463e508ea2f
---

| id | severity | Task | file:line | finding | plan change |
|---|---|---|---|---|---|
| TL-1 | should | Task 2, Task 5 | `src/dispatch.ts:224-225`, `src/usage-stats.ts:86-90` | The plan records only the resolved command’s short name. Commands with the same name from different agents are combined into one “top commands” row, so stats can’t distinguish which command was used. | Add a stable agent-qualified command key (for example, `agent:name`) to the per-command store and stats output; cover duplicate names from different agents in Task 2 and Task 5 tests. |

OPEN_BLOCK_SHOULD=1
