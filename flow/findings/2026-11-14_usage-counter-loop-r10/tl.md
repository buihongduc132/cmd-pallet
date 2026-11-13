---
title: usage-counter loop r10 — tl
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: da1c743243ab0e16a597b80aca35aef64387258b
reviewer: codex exec read-only 0m 01a1d6b3-d80a-7b73-8c7d-00b1e36931fd
---

| id | severity block/should/nit | Task | file:line | finding | plan change |
|---|---|---|---|---|---|
| TL-3 | should | Task 1 | flow/plans/2026-11-14_usage-counter.md:35,38 | The stale `.break` recovery has the same race G13 targets: two breakers can both observe an old `.break`, then remove/recreate it and concurrently break the protected lock. The lock recheck does not serialize recovery of the breaker mutex itself. | Add serialized stale-`.break` recovery (or another atomic ownership protocol) and a concurrent dead-breaker recovery race test; cite [TL-3]. |
| TL-1 | nit | Task 2, Task 5 | flow/plans/2026-11-14_usage-counter.md:19,44-45,75 | Re-checked: resolved. The plan specifies agent-qualified command keys and tests duplicate command names across agents. | No change; [TL-1] remains covered. |
| TL-2 | nit | Final verification | flow/plans/2026-11-14_usage-counter.md:86-90 | Re-checked: resolved. Pre-merge checks precede merge and push; both real E2Es run afterward on `main`. | No change; [TL-2] remains covered. |

OPEN_BLOCK_SHOULD=1