---
title: Usage counter — per host / action / date-hour JSON, git-synced
date: 2026-11-14
tags: [plan, spb, cmd-pallet/usage]
intentions: "[[2026-11-14_usage-counter]]"
---

# Plan — cmd-pallet usage counter

**Worktree:** /data/worktrees/cmd-pallet-wt--wt-usage-counter · **Branch:** wt/usage-counter · **Base:** main@8d21990
All Tasks run in the pinned worktree (`git -C /data/worktrees/cmd-pallet-wt--wt-usage-counter rev-parse --show-toplevel`). Intentions: `flow/intentions/2026-11-14_usage-counter.md` ([U1]..[U6]).

**Goal:** every cmd-pallet invocation bumps a counter in a JSON file inside this repo, and the counts get committed and pushed so all machines' usage merges in git; a `stats` verb reads the merged files. [U1][U2][U5][U6]
**Architecture:** `src/usage.ts` (pure store: key, increment, lock, atomic write) + `src/usage-sync.ts` (debounced detached git commit/push of `usage/` only) + `src/usage-stats.ts` (pure read/aggregate). `runCli` wraps `dispatch`: after the verb finishes, record usage; any usage error is swallowed (never changes exit code or output). [U1][U2][U6]
**Tech:** Node ≥22.18 strip-types TS, `node:*` only, vitest. [U1 "inside the cmd-pallet repository itself"]

## Data contract [U3][U4]
- `usage/<hostname>.json` → `{ "<hostname>": { "<action>": { "YYYY-MM-DDTHH": n } } }` [U3]
- `usage/<hostname>.cmds.json` → `{ "<hostname>": { "<cmd>": { "<action>": { "YYYY-MM-DDTHH": n } } } }` — only `read`, `get`, `run` (verbs that take one cmd); `<cmd>` = `<agent>:<name>` of the resolved command (same `agent:name` form the CLI already prints for ambiguous candidates), else the name as typed (not found / ambiguous). Two agents' same-named cmds stay separate rows. Keys recorded before r5 (bare name) are left as-is and show as their own rows (no migration). [U4 "put what cmd being read"][TL-1]
- date-hour = UTC. hostname = `os.hostname()`. action per intention elaboration of [U2]. [U3][U5 "between multiple machine" → one clock]
- One file per host → two machines never edit the same file → git merge never conflicts. [U5 "merged usage between multiple machine utilizing git"]
- Keys written sorted → stable diffs. [U1 "commit and push all changes"]

## Env knobs
- `CMD_PALLET_USAGE=0` → disable record + sync; whole test suite sets it via `vitest.config.ts` `test.env` (suite must never write or commit the real store). [U1 "this will tracked and commit"]
- `CMD_PALLET_USAGE_DIR` → override store dir (default `<repo>/usage`, repo = parent of `src/`; a linked worktree (`.git` is a file) has NO default store → records only with this env set, so worktree runs never create usage files that later conflict with main). [U1][U5]
- `CMD_PALLET_USAGE_SYNC_MIN` → debounce minutes (default 10; invalid/negative → default). [U1 "commit and push" without slowing every invocation]
- All three read in ONE place (`recordInvocation` in `src/cli.ts` + `resolveUsageDir` in `src/usage.ts`, shared by record and `stats`). [U2][U6]

## Task 1 — usage store [U1][U3][U4]
Files: create `src/usage.ts`, `tests/usage.test.ts`.
- `dateHourKey(d: Date): string` → UTC `YYYY-MM-DDTHH`. [U3 "date-hour"]
- `actionOf(verb, flags, known)` → action string per [U2] elaboration (`--help`/no verb → `help`, `--version` → `version`, unknown verb → `unknown`). [U2 "any action"]
- `recordUsage({dir, host, action, cmd?, now})`: lock (`mkdir <dir>/.lock`, stale after 10 s, retry ≤ 50 × 20 ms; give up silently), read JSON (missing/corrupt → `{}`; corrupt file renamed `*.corrupt-<ts>`), increment, write sorted JSON to tmp + `rename`. [U3 "keep increase it"][U1]
- Store objects are null-prototype and walked by own keys only → a cmd/host named `__proto__`/`constructor` is stored as a plain key, never pollutes prototypes. [U4 "put what cmd being read" — cmd name is user input]
- RED first: key format; first increment; repeated increment same hour; new hour new key; cmds file only when `cmd` given; 20 parallel `recordUsage` calls → count 20; corrupt file recovery; `__proto__` cmd name stored as key. [U3][U4]
- Pass: `npx vitest run tests/usage.test.ts`. [U3]

## Task 2 — wire into CLI [U2][U4]
Files: modify `src/cli.ts` (`runCli`, `recordInvocation`), `src/dispatch.ts` (set `io.usage.cmd`), `src/types.ts` (`IoStreams.usage?`), `vitest.config.ts` (`test.env: { CMD_PALLET_USAGE: "0" }` — covers spawned-bin tests in `smoke`/`regression-defects` that pass `...process.env`), create `tests/usage-cli.test.ts`.
- `runCli(argv, io)`: `try { return await dispatch(...) } finally { try { recordInvocation(argv, env, io.usage) } catch {} }`; `env = io?.env ?? process.env`; dispatch throwing still counts. [U2 "per invokation of any action"]
- `<cmd>` = `<agent>:<name>`: `dispatch` sets `io.usage.cmd = command.source.agent + ":" + command.name` after `findCommand` resolves in read/get/run; not found/ambiguous → name as typed. No second catalog load. [U4][U6 "which cmd being use most" needs one key per cmd][TL-1]
- RED: via `runCli` with temp `CMD_PALLET_USAGE_DIR`: `list` → `list` count 1; `read <x>` → actions + cmds file; unknown verb → `unknown`; `--version` → `version`; failing store dir (file in place of dir) → exit code unchanged, stdout unchanged; linked-worktree repo root without `CMD_PALLET_USAGE_DIR` → nothing written; two fixture agents each with cmd `x` → `read a1:x` and `read a2:x` land under two distinct keys `a1:x`, `a2:x` [TL-1]; spawned binary: `execFileSync(process.execPath, ['bin/cmd-pallet.js','list'], {env: {...process.env, CMD_PALLET_USAGE: '1', CMD_PALLET_USAGE_DIR: <tmp>, CMD_PALLET_USAGE_SYNC_MIN: '9999'}})` → `<tmp>/<host>.json` has `list` count 1 and stdout equals the same run with `CMD_PALLET_USAGE=0` (proves the published entrypoint records, not only `runCli`). [U2 "per invokation of any action"]
- Full suite still green: `npx vitest run`; `git status --porcelain usage/` empty after it. [U1]

## Task 3 — git sync [U1][U5]
Files: create `src/usage-sync.ts` (also worker entry: `node --experimental-strip-types src/usage-sync.ts <repoDir>`), `tests/usage-sync.test.ts`; modify `.gitignore` (`usage/.lock`, `usage/*.tmp*`, `usage/*.corrupt-*`, `usage/.sync-*`). [U1 "tracked and commit and push"]
- `maybeSync({repoDir, usageDir, now, debounceMin})`: `usageDir` ≠ `<repoDir>/usage` or no `<repoDir>/.git` → skip. `<usageDir>/.sync-stamp` mtime < debounce → skip. Else spawn worker detached, `stdio: 'ignore'`, `unref()`; touch stamp ONLY after `spawn` returned without throwing (failed spawn → no stamp → next invocation retries). No git subprocess on the hot path. [U1 "commit and push all changes"][U2 "per invokation" stays fast]
- Worker `syncUsage(repoDir)` (sync, exported for tests). Every git call: `execFileSync('git', [...], {cwd, timeout: 60000, env: {...env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes'}})`. Lock `usage/.sync-lock` dir, stale after 5 min → break. [U1][U5]
  0. Guards (one helper `guards(repoDir)`, reused by step 4) → skip whole sync: merge/rebase/cherry-pick/bisect in progress (`git rev-parse --git-path MERGE_HEAD|rebase-merge|rebase-apply|CHERRY_PICK_HEAD|BISECT_LOG` exists); detached HEAD; branch ≠ `main`; upstream of `main` ≠ `origin/main`. [U5 "merged usage ... utilizing git" on main only]
  1. `git add -- usage/*.json`; nothing staged for usage → no commit (still try push of earlier usage commits). [U1]
  2. `git commit -m "chore(usage): <host> <iso>" -- usage/` (commits ONLY usage paths; other dirty files untouched). [U1 "commit ... all changes" of the store only]
  3. `git fetch origin`. HEAD has commits ahead of `@{u}` touching paths outside `usage/` → stop (never push someone else's unpushed work; local usage commit stays, pushed by a later sync). [U5]
  4. If behind: re-run the FULL step-0 `guards(repoDir)` incl. upstream identity, as the last check before merge (checkout is shared; state may have changed), pin `target = rev-parse @{u}`, `git merge --no-edit <target>`. On failure run `git merge --abort` ONLY when MERGE_HEAD did not exist before and now equals `target` (never abort a merge someone else started); stop. ACCEPTED: this pulls origin/main into the live checkout like `git pull` would (README callout). [U5]
  5. `git push origin main`. Rejected (another host pushed first) → back to step 3, max 3 attempts total, then stop (next debounce retries). [U5 "merged usage between multiple machine"; live race 2026-11-14, cpal-qp8.5]
  6. Append one outcome line to `usage/.sync-log` (gitignored). [U1]
- RED: temp bare remote + 2 clones (host A, host B), each records + `syncUsage` → remote tree has `usage/A.json` and `usage/B.json`, no conflict; unrelated dirty file stays dirty + uncommitted; non-main branch → no commit; rebase in progress → no commit; local non-usage commit ahead → usage committed but NOT pushed; stale `.sync-lock` → still syncs; foreign merge started between guards and merge → not aborted; push race (other host pushes in `beforePush`) → resolved within 3 attempts, and bounded at 3; debounce: second `maybeSync` within window does not spawn; `spawnImpl` throws → no `.sync-stamp` written, next `maybeSync` within window spawns [U1]; upstream of `main` changed to another remote in `beforeMerge` → no merge, no push [U5]. [U1][U5]

## Task 4 — docs + real E2E [U5][U6]
Files: modify `README.md` (Usage tracking section: files, shape, env knobs, merge model, `stats`, callouts: sync merges origin/main into the live checkout; background commit briefly holds `index.lock`; linked worktrees do not record by default). [U5 "keep track"]
- Real run on this host after merge to `main`: `CMD_PALLET_USAGE_SYNC_MIN=0 cmd-pallet read spb-plan` → `usage/$(hostname).json` + `.cmds.json` show counts (cmd key `<agent>:spb-plan`); after the worker finishes (`usage/.sync-log` gains an `ok:` line), `git fetch && git log origin/main -1 --format=%s -- usage/` shows `chore(usage): <this host>`. [U1][U4][U5]

## Task 5 — `stats` verb [U6]
Files: create `src/usage-stats.ts` (pure: read `usage/*.json` + `usage/*.cmds.json` of ALL hosts → aggregate), modify `src/verbs.ts` (verb `stats`, no flags), `src/dispatch.ts` (route), test `tests/usage-stats.test.ts`, README Usage tracking section. [U6 "having stats"]
- r5 delta vs landed a684f92: drop `--top`, `--host`, `--json` (verb table, dispatch parsing, `StatsOptions.top/host`, their tests, README lines) — not asked by [U6]; row limit becomes a constant 10. [U6]
- `cmd-pallet stats` reads the merged `usage/` dir via `resolveUsageDir` (same as recording), never writes. Top commands and date-hour rows capped at 10; machine rows and the 24 hour-of-day rows uncapped. [U6][U5 "merged usage"]
- Output sections [U6 "which cmd being use most , and which machine , time"]:
  1. **Top commands**: cmd | total | per host (sum over verbs read/get/run and all hours), sorted total desc, top 10. [U6 "which cmd being use most"]
  2. **By machine**: host | total invocations (sum of action file) | top action, sorted desc. [U6 "which machine"]
  3. **By time**: date-hour (UTC) | total across hosts, most recent 10 rows; plus hour-of-day (00–23 UTC) totals. [U6 "time"]
- File accepted only when ALL hold: JSON object; exactly one top-level key equal to the filename host stem; action file depth 3 / cmds file depth 4 of plain objects; every leaf key matches `^\d{4}-\d{2}-\d{2}T\d{2}$` and every value is a positive safe integer. Any violation → whole file skipped with one stderr warning naming it (no partial counts). Empty/missing dir → "no usage recorded" exit 0. [U6 "stats on which cmd ... machine , time" must not count garbage]
- RED: fixture usage dir with 2 hosts → exact top-command order, per-host totals, date-hour and hour-of-day sums; corrupt JSON skipped; `{ "hostA": { "list": { "not-a-date": -2 } } }` in `hostA.json` → warning + zero contribution; host key ≠ filename → skipped; wrong depth → skipped; empty dir; `stats --top 3` → usage error (flag gone). [U6]
- Real run: `cmd-pallet stats` on this host after `git pull` shows one "By machine" row per `usage/<host>.json` present in the checkout (row count == file count). [U5][U6]

## Out of scope
- pi `cmd_palette` tool in pi-cmd-palette repo (separate code path; does not invoke this CLI) — callout only, no [U#] asks for it.

## Final verification [U1][U2][U5][U6]
`npx tsc --noEmit`, `npx vitest run` all green; real E2E of Task 4 + Task 5 real run; `superpower-requesting-code-review` on the branch diff; merge `wt/usage-counter` → `main`, push.

## GC landing
Rig `cmd-pallet` (prefix `cpal`, suspended). Epic `cpal-qp8`. Convoy `cpal-1mj` (owned, target `wt/usage-counter`, merge local).
| Task | bead | convoy | edges | landed |
|---|---|---|---|---|
| T1 usage store | cpal-qp8.1 | cpal-1mj | — | 54b6552, 72d1406 (N6) |
| T2 wire runCli | cpal-qp8.2 | cpal-1mj | blocked-by .1 (consumes `recordUsage`) | 8ab105f, 72d1406 (N5) |
| T3 git sync | cpal-qp8.3 | cpal-1mj | blocked-by .2 (extends `recordInvocation`) | ab62acc, 72d1406 (B1) |
| T4 README + E2E | cpal-qp8.4 | cpal-1mj | blocked-by .3 (needs full pipeline) | 1acac53 |
| bug push race (T3 step 5) | cpal-qp8.5 | — | discovered-from .3 | bbf428d |
| T5 stats verb | cpal-qp8.6 | — | reads files produced by .1/.3 | a684f92 |
| r5 delta: T2 (TL-1 key, G3 bin E2E), T3 (G1 stamp, G4 guards), T5 (G2 schema, OE2 flag drop) | land via `/spb-plan-to-gc` after loop EXIT [U1..U6 per Task] | cpal-1mj | per parent Task | — |

## Gate ledger (pre-loop history)
| Plan rev | (a) covered | (b) simplest | @V |
|---|---|---|---|
| r1 | FAIL | FAIL | REVISE (8 items) |
| r2 | PASS | PASS | EXIT |
| r3 | +T5 stats [U6], +push-race bug folded into T3 step 5 | — | not gated as a whole plan → re-gated in loop round 4 |

## spb-gotcha-and-strip-loop
`round | plan SHA | gotcha findings (open/closed) | tech-lead findings (open/closed) | strip [OEn] removed | (a) | (b) | @V session id + verdict`
| 4 | f0f53d8 | 4 open / 0 closed (G1 stamp-before-spawn, G2 stats nested-schema, G3 spawned-bin E2E, G4 upstream re-check before merge) | 1 open / 0 closed (TL-1 agent-qualified cmd key) | 0 removed; 2 open (OE1 30 s push SLA + named-host acceptance, OE2 `--top/--host/--json`) | FAIL | FAIL | codex @V-1 01a1d65e-5774-7d02-9c43-a1f751563c48 REJECT + @V-2 01a1d65e-5755-7951-b8e4-bfcc2a8d239a REJECT → CONTINUE (jewilo goal 246cc954 0/2: hermes provider `bhd-litellm` unknown → subagent fallback). Reports: [[2026-11-14_usage-counter-loop-r4/gotcha]] · [[2026-11-14_usage-counter-loop-r4/tl]] · [[2026-11-14_usage-counter-loop-r4/strip]] · [[2026-11-14_usage-counter-loop-r4/v1]] · [[2026-11-14_usage-counter-loop-r4/v2]] |
| 5 | 00bd7f9 | 1 open / 4 closed (G1-G4 closed; G5 open rank 4: two machines with same `os.hostname()` share one file → conflict/loss, no collision policy or test) | 0 open / 1 closed (TL-1 resolved in plan; reviewer open count judged landed code, @V ruled plan-level PASS) | 0 removed; OE2 closed (planned flag drop); OE1 open (Tasks 4/5 acceptance tied to "this host" runs → replace with generic E2E proof) | FAIL | FAIL | codex @V 01a1d66d-aed0-7742-9809-c311d0ffe3f6 CONTINUE (OPEN=2: G5, OE1). Reviewers: gotcha 01a1d66b-cb96-78d3-b1b2-90d2f0352b7c · tl 01a1d66b-cbae-7b70-9755-787996a9fd48 · strip 01a1d66b-cb88-78b2-a7c2-6beac21753d6. Reports: [[2026-11-14_usage-counter-loop-r5/gotcha]] · [[2026-11-14_usage-counter-loop-r5/tl]] · [[2026-11-14_usage-counter-loop-r5/strip]] · [[2026-11-14_usage-counter-loop-r5/v]] |
