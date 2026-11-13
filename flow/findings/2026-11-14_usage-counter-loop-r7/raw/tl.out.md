| id | severity block/should/nit | Task | file:line | finding | plan change |
|---|---|---|---|---|---|
| TL-1 | nit | Task 2, Task 5 | `flow/plans/2026-11-14_usage-counter.md:44-45, 75` | **Re-check from rounds 4–6: resolved in the plan.** Command keys are agent-qualified, and duplicate-name coverage is specified. | No change; both call sites and tests are explicitly in scope. |
| TL-2 | should | Task 4, Final verification | `flow/plans/2026-11-14_usage-counter.md:69-70, 85-86` | Task 4’s E2E requires running after merge to `main`, while final verification orders E2E before the merge. The plan’s acceptance sequence is contradictory. | Make the sequence explicit: complete pre-merge checks, merge and push, then run the Task 4 and Task 5 E2Es against `main`. |
OPEN_BLOCK_SHOULD=1