| id | severity block/should/nit | Task | file:line | finding | plan change |
|---|---|---|---|---|---|
| TL-1 | should | Task 2, Task 5 | `src/dispatch.ts:225`, `src/usage-stats.ts:88` | **Round‑4 TL‑1 is addressed in the plan but not in the code at this SHA:** dispatch stores only `command.name`, and stats groups by that short name, so same-named commands from different agents still merge. | Keep the agent-qualified key and duplicate-name tests in Tasks 2 and 5; ensure the planned work updates both existing call sites and tests to use `<agent>:<name>`. |
OPEN_BLOCK_SHOULD=1