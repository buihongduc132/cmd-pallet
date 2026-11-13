---
title: usage-counter loop r8 — v (exit judge)
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: 3683996bfa0c4fa2f30835c5b22721a8123ed5c0
reviewer: codex exec read-only 01a1d68c-1487-7c40-9afa-0402e5639440
---

CONTINUE
(a) FAIL — G10–G12 are unresolved in the plan: Task 4 inherits `CMD_PALLET_USAGE` without forcing it on; millisecond `T0` keys can collide; PID reuse can make a dead lock appear live.
(a2) PASS — Tech-lead table has zero open block/should findings; TL-1 and TL-2 are resolved.
(b) PASS — No unadopted simpler compliant approach or open strip obligation remains; the required merge and push support post-merge E2E.

1. **G10:** Set `CMD_PALLET_USAGE=1` explicitly for the Task 4 CLI invocation and specify an assertion that it records and syncs K even when the parent environment sets it to `0`.
2. **G11:** Make K unique across simultaneous E2E runs, such as adding a random per-run component; assert each run records its own key exactly once remotely.
3. **G12:** Resolve PID reuse in the lock design. Specify how owner identity distinguishes a live lock holder from an unrelated process reusing its PID, plus a test for that case.

VERDICT=CONTINUE OPEN=3