## PRIMARY

| Your exact words | Files and lines | Required work |
|---|---|---|
| [U1] “make the json storage (inside the cmd-pallet repository itself , this will tracked and commit and push all changes as well).” [intentions:12] | Plan lines 17–18, 25–28, 49–60, 81–82; landed store/sync: `src/usage.ts`, `src/usage-sync.ts` | Keep the repo-local JSON store and usage-only background commit/push with the planned safeguards. |
| [U2] “per invokation of any action of cmd-pallet , make the counter of these usage” [intentions:13] | Plan lines 35, 42–47; landed wiring: `src/cli.ts` | Count each invocation once, including help, version, unknown verbs, and dispatch failures. |
| [U3] “{ <hostname>: { <action>: { date-hour: count } } ( keep increase it and group per date-hour per action ;” [intentions:14] | Plan lines 17–18, 34–40; landed store: `src/usage.ts` | Keep incrementing per-host, per-action, UTC date-hour counts. |
| [U4] “ALSO for invoke that read 1 cmd , must having storage like that put what cmd being read.” [intentions:15] | Plan lines 19, 45–46; landed wiring: `src/dispatch.ts` | Record the resolved command for read/get/run invocations, retaining agent-qualified keys. |
| [U5] “This is for us to keep track and also merged usage between multiple machine utilizing git.” [intentions:16] | Plan lines 20–30, 49–64; landed sync: `src/usage-sync.ts` | Preserve per-machine usage through git sync and prevent same-file collisions from merging silently. |
| [U6] “And also later on having stats on which cmd being use most , and which machine , time.” [intentions:17] | Plan lines 66–76; landed stats: `src/usage-stats.ts`, `src/dispatch.ts` | Keep readable command, machine, and time summaries over merged usage. |

## [OEn] obligations to remove or replace

- **[OE1] Closed in current plan:** Round 5’s host-specific acceptance concern is resolved. Task 4 uses “any machine”; Task 5 checks the actual `<host>` from the data. These are generic E2E readbacks, not fixed named-host requirements. Keep them.
- **[OE2] Closed in current plan:** Removing `--top`, `--host`, and `--json` is a justified strip of already-landed, unrequested stats controls. The plan limits stats to the requested summaries; retain the removal and its regression assertion.
- **[OE3] G5 collision recovery is incomplete:** The override plus collision check is a low-complexity way to stop conflicting pushes, and its test demonstrates conflict avoidance. But the plan explicitly accepts that B’s already-committed counts remain local and unmerged (line 22), so this path does not preserve the full [U5] merged-usage outcome. Replace that loss path with the smallest recovery that makes the collided counts mergeable under the new identity, and assert those counts appear remotely. The override and collision check alone are not sufficient.

## Cost comparison

Estimates in engineering work-days; not measured. Existing landed code is baseline, not new execution cost.

| quote | init solutions | strip solutions | why strip delivery still meet quote requirement |
|---|---|---|---|
| [U1][U5] storage and merged usage | Store and guarded git sync; ~2.5–4d remaining | Same, plus collision-count recovery; ~2.5–4.5d remaining | Per-machine usage still commits and merges; collision recovery closes the identified gap. |
| [U2][U3][U4] invocation and counts | CLI wiring, per-hour/action keys, command keys; ~1.5–2.5d remaining | Same; ~1.5–2.5d remaining | All invocation, grouping, and command outcomes remain. |
| [U6] summaries | Stats with optional controls; ~1–1.5d remaining | Basic requested summaries; ~1–1.5d remaining | Command, machine, and time summaries remain without unrequested controls. |

| Cost bucket | Initial | Strip |
|---|---:|---:|
| Authoring sunk | 0d | 0d |
| Decision round with user | 0d | 0d |
| Execution | 5–8d | 5–8.5d |
| Upkeep/sync per artifact | 0.2–0.5d | 0.2–0.5d |
| Policy/recurring tax | 0d | 0d |
| Rework-risk | 0.5–1d | 0.2–0.5d |
| **Total** | **5.7–9.5d** | **5.4–9.5d** |
| **Strip-cost-now** | — | **0.1–0.2d** |

**Verdict: REJECT / re-plan the same plan for OE3.** `HEAD` matches `56ea2c9a5637065fb5162e2bfcc417b18aead256`. Same-host recovery is the only open OE. The `CMD_PALLET_USAGE_HOST` knob and collision check are the simplest safe detection and stop mechanism, but their documented recovery leaves counts unmerged. `BAN_SCAN: REJECT · P7 (incomplete outcome/cost delta) · plan line 22.`

OPEN_OE=1