---
title: usage-counter loop r7 — v (exit judge)
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: 1d245b3cbf7b99d38098efc4f62b3be5980840cd
reviewer: codex exec read-only 01a1d689-0ab6-7ce1-97c3-6ff2d5d98468
---

CONTINUE
(a) FAIL — G9 is unresolved: a concurrent same-host invocation can satisfy Task 4’s remote-count and post-`T0` commit checks.
(a2) FAIL — TL-2 is unresolved: Task 4 requires post-merge execution, but final verification places E2E before merge.
(b) FAIL — OE4 remains: final verification requires an unrequested code review and feature-branch merge/push.

1. **Task 4:** Make its E2E distinguish the tested invocation’s increment from concurrent same-host syncs, or isolate the test from concurrent writers; add an assertion that reproduces G9.
2. **Final verification:** Put pre-merge checks before merge, then merge and push before running Task 4 and Task 5 E2Es.
3. **Final verification:** Remove the code-review and feature-branch merge/push obligations; retain the requested usage-data sync and required checks.

VERDICT=CONTINUE OPEN=3