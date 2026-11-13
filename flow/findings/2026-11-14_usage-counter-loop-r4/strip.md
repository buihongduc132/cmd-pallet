---
title: usage-counter loop r4 — strip
date: 2026-11-14
tags: [findings, spb/loop, cmd-pallet/usage]
plan_sha: f0f53d86c65fbf2a88e3ae0d32fc7463e508ea2f
---

## PRIMARY

| Your exact words | Files and lines | Required work |
|---|---|---|
| [U1] “make the json storage (inside the cmd-pallet repository itself , this will tracked and commit and push all changes as well).” — [intention](flow/intentions/2026-11-14_usage-counter.md:12) | [plan](flow/plans/2026-11-14_usage-counter.md:17)–[61]; implementation: [usage store](src/usage.ts:31)–[188), [git sync](src/usage-sync.ts:44)–[254) | Keep per-host JSON storage and background sync of usage files; commit/push only usage data. |
| [U2] “per invokation of any action of cmd-pallet , make the counter of these usage” — [intention](flow/intentions/2026-11-14_usage-counter.md:13) | [plan](flow/plans/2026-11-14_usage-counter.md:30)–[44]; implementation: [CLI](src/cli.ts:18)–[60), [store](src/usage.ts:43)–[51) | Count each invocation once, including help, version, unknown verbs, and failing dispatches. |
| [U3] “{ <hostname>: { <action>: { date-hour: count } } ( keep increase it and group per date-hour per action ;” — [intention](flow/intentions/2026-11-14_usage-counter.md:14) | [plan](flow/plans/2026-11-14_usage-counter.md:17)–[22); implementation: [store](src/usage.ts:31)–[34), [increment](src/usage.ts:122)–[133) | Keep incrementing per-host, per-action, UTC date-hour counts. |
| [U4] “ALSO for invoke that read 1 cmd , must having storage like that put what cmd being read.” — [intention](flow/intentions/2026-11-14_usage-counter.md:15) | [plan](flow/plans/2026-11-14_usage-counter.md:19), [39)–[43); implementation: [CLI dispatch](src/dispatch.ts:211)–[225), [288)–[303) | Record the command name for read/get/run invocations. |
| [U5] “This is for us to keep track and also merged usage between multiple machine utilizing git.” — [intention](flow/intentions/2026-11-14_usage-counter.md:16) | [plan](flow/plans/2026-11-14_usage-counter.md:46)–[61); implementation: [git sync](src/usage-sync.ts:148)–[208) | Preserve per-host files and merge/push them through git with safeguards against unrelated changes. |
| [U6] “And also later on having stats on which cmd being use most , and which machine , time.” — [intention](flow/intentions/2026-11-14_usage-counter.md:17) | [plan](flow/plans/2026-11-14_usage-counter.md:63)–[73); implementation: [stats](src/usage-stats.ts:77)–[131), [CLI verb](src/verbs.ts:52)–[56) | Provide command, host, and time usage summaries. |

## SECONDARY cost table

Estimates for the necessary delta from the inspected implementation; not measured effort. “Initial” reflects the plan as written; “strip” removes only the obligations identified below.

| quote | init solutions | strip solutions | why strip delivery still meet quote requirement |
|---|---|---|---|
| [U1][U5] storage and merged usage | Store, debounced worker, sync locks/guards/retries, and multiple-host git integration tests; about 3–5 days | Keep store and safe git sync; remove the invented 30-second push SLA; about 2.5–4 days | Actual commit/push and multi-host merge remain required. No quote sets a 30-second deadline. |
| [U2][U3][U4] invocation and counters | Invocation wiring, date/action keys, per-command data, concurrency/corrupt-file/security cases; about 1.5–2.5 days | Same necessary behavior and focused tests; about 1.5–2.5 days | No cheaper equivalent preserves all-action counts and per-command data with concurrent writes. |
| [U6] stats | Aggregation plus `--top`, `--host`, `--json`, fixed named-host expectation, and tests; about 1.5–2.5 days | Basic readable command/host/time summaries and tests; about 1–1.5 days | The quote asks which command, machine, and time; configurable filters/output and named hosts are not needed to answer it. |

**Cost buckets (engineering work-days; estimates, not measured):**

| Bucket | Initial | Strip |
|---|---:|---:|
| Authoring sunk | 0 | 0 |
| Decision round with user | 0 | 0 |
| Execution | 5–8 | 4–6 |
| Upkeep/sync per artifact | 0.2–0.5 | 0.2–0.5 |
| Policy/recurring tax | 0 | 0 |
| Rework-risk | 0.5–1 | 0.2–0.5 |
| **Total** | **5.7–9.5** | **4.4–7** |
| **Strip-cost-now** | — | **0.1–0.2** |

## [OEn] obligations to remove or replace

- **[OE1] Higher-effort equivalent / invented SLA** — plan lines 61 and 73 require push within 30 seconds and rows for three named hosts. Neither is in [U1]–[U6]. Remove those fixed expectations; retain observed commit/push and aggregated stats acceptance. The 30-second bound adds timing/retry pressure without changing the requested outcome.
- **[OE2] Unrequested interface options** — plan lines 65 and 70, implemented at [verbs](src/verbs.ts:55) and [dispatch](src/dispatch.ts:91)–[113), require `--top`, `--host`, and `--json`. They are not needed for [U6]; replace with the simplest readable summary. This removes option parsing and associated behavior/tests.
- **[OE3] Gate evidence missing** — plan lines 78–100 include final verification, landing, and empty gate-ledger templates, but this review did not verify same-SHA independent approvals or actual E2E readback. Keep status **NOT VERIFIED** until those original obligations have evidence; don’t treat ledger text as approval.

**Actual scope strip:** Remove the SLA and optional stats controls from the execution contract; retain storage, counting, cross-machine git merge, stats summaries, and behavior/safety tests. Existing code already implements the quoted core; this review did not modify the read-only plan or descendants. Fixed host names are an acceptance fixture, not a user requirement.

**E2E / status:** Source inspection confirms producer, persistence, aggregation, and CLI consumer exist. Actual remote push and stats readback on the stated machines were not independently observed here; full E2E is **NOT VERIFIED**. Plan SHA: `f0f53d86c65fbf2a88e3ae0d32fc7463e508ea2f`; HEAD matches. Working tree reported clean.

**Assumptions:** The intention’s [U6] “later on” is treated as requested eventual behavior, not authorization for optional CLI controls. Scope is this plan only; no descendant artifacts were changed.

**Verdict: STRIP** — same plan needs the listed scope removals and then same-SHA review. `BAN_SCAN: REJECT · I2 scope creep (stats controls) · P7 unnecessary cost; reference ~/.pi/agent/prompts/_references/plan/BANNED-planning-theater-inflation.md`

OPEN_OE=2
