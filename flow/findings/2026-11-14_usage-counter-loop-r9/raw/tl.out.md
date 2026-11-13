| id | severity block/should/nit | Task | file:line | finding | plan change |
|---|---|---|---|---|---|
| TL-1 | nit | Task 2, Task 5 | flow/plans/2026-11-14_usage-counter.md:20,44-45,75 | Re-check from rounds 4–8: resolved. Command keys are agent-qualified, and duplicate-name coverage is specified. | No change; both call sites and tests are in scope. |
| TL-2 | nit | Task 4, Final verification | flow/plans/2026-11-14_usage-counter.md:85-88 | Re-check from rounds 4–8: resolved. Pre-merge checks come first; Task 4 and Task 5 E2Es run afterward on `main`. | No change; the sequence is explicit. |

OPEN_BLOCK_SHOULD=0