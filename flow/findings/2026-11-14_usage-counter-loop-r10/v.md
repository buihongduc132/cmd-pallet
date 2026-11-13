---
title: usage-counter loop r10 — v (exit judge)
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: da1c743243ab0e16a597b80aca35aef64387258b
reviewer: codex exec read-only 01a1d6b5-202d-7950-a1d0-88ab2635e399
---

CONTINUE

(a) **FAIL** — G13 is still racy: the plan rechecks the lock owner, then removes the directory in separate operations. An ownerless lock can also be broken during the live owner’s `mkdir`→owner-file window (N2). The plan adds a same-host failure test despite treating distinct hostnames as a precondition; remove that obligation (OE2).

(a2) **FAIL** — TL-3 remains open: aged `.break` recovery can remove a newly recreated mutex. The plan has no safe recovery protocol or race test.

(b) **FAIL** — OE1 identifies the unresolved `.break` recovery race; OE2 correctly calls for dropping the out-of-precondition same-host test. The G13 change does not close either issue.

1. **G13 unresolved:** serialize stale-lock removal atomically with replacement; the fresh owner can still be removed after the nonce check.
2. **N1 / TL-3 unresolved:** aged `.break` cleanup can race with a live breaker. Add safe ownership/recovery and a concurrent recovery test.
3. **N2 unresolved:** the lock directory exists before its owner file is written; an aged ownerless directory can be broken while its creator is alive.
4. **OE1 unresolved:** replace the non-atomic `.break` stale cleanup and retain a race test.
5. **OE2 valid:** drop the same-host-specific RED assertions from Task 3; the stated precondition is distinct hostnames, and same-host handling is deferred by the arbiter.

VERDICT=CONTINUE OPEN=5