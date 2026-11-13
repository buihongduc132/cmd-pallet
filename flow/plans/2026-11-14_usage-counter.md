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
- `usage/<hostname>.cmds.json` → `{ "<hostname>": { "<cmd>": { "<action>": { "YYYY-MM-DDTHH": n } } } }` — only `read`, `get`, `run` (verbs that take one cmd); `<cmd>` = resolved command name when found, else the name as typed. [U4 "invoke that read 1 cmd"]
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
- `<cmd>` = resolved name: `dispatch` sets `io.usage = { cmd: <resolved name> }` after `findCommand` succeeds in read/get/run; not found/ambiguous → name as typed. No second catalog load. [U4][U6 "which cmd being use most" needs one key per cmd]
- RED: via `runCli` with temp `CMD_PALLET_USAGE_DIR`: `list` → `list` count 1; `read <x>` → actions + cmds file; unknown verb → `unknown`; `--version` → `version`; failing store dir (file in place of dir) → exit code unchanged, stdout unchanged; linked-worktree repo root without `CMD_PALLET_USAGE_DIR` → nothing written. [U2][U4]
- Full suite still green: `npx vitest run`; `git status --porcelain usage/` empty after it. [U1]

## Task 3 — git sync [U1][U5]
Files: create `src/usage-sync.ts` (also worker entry: `node --experimental-strip-types src/usage-sync.ts <repoDir>`), `tests/usage-sync.test.ts`; modify `.gitignore` (`usage/.lock`, `usage/*.tmp*`, `usage/*.corrupt-*`, `usage/.sync-*`). [U1 "tracked and commit and push"]
- `maybeSync({repoDir, usageDir, now, debounceMin})`: `usageDir` ≠ `<repoDir>/usage` or no `<repoDir>/.git` → skip. `<usageDir>/.sync-stamp` mtime < debounce → skip. Else touch stamp, spawn worker detached, `stdio: 'ignore'`, `unref()`. No git subprocess on the hot path. [U1][U2 "per invokation" stays fast]
- Worker `syncUsage(repoDir)` (sync, exported for tests). Every git call: `execFileSync('git', [...], {cwd, timeout: 60000, env: {...env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes'}})`. Lock `usage/.sync-lock` dir, stale after 5 min → break. [U1][U5]
  0. Guards → skip whole sync: merge/rebase/cherry-pick/bisect in progress (`git rev-parse --git-path MERGE_HEAD|rebase-merge|rebase-apply|CHERRY_PICK_HEAD|BISECT_LOG` exists); detached HEAD; branch ≠ `main`; upstream ≠ `origin/main`. [U5 "merged usage ... utilizing git" on main only]
  1. `git add -- usage/*.json`; nothing staged for usage → no commit (still try push of earlier usage commits). [U1]
  2. `git commit -m "chore(usage): <host> <iso>" -- usage/` (commits ONLY usage paths; other dirty files untouched). [U1 "commit ... all changes" of the store only]
  3. `git fetch origin`. HEAD has commits ahead of `@{u}` touching paths outside `usage/` → stop (never push someone else's unpushed work; local usage commit stays, pushed by a later sync). [U5]
  4. If behind: re-run step-0 guards (checkout is shared; state may have changed), pin `target = rev-parse @{u}`, `git merge --no-edit <target>`. On failure run `git merge --abort` ONLY when MERGE_HEAD did not exist before and now equals `target` (never abort a merge someone else started); stop. ACCEPTED: this pulls origin/main into the live checkout like `git pull` would (README callout). [U5]
  5. `git push origin main`. Rejected (another host pushed first) → back to step 3, max 3 attempts total, then stop (next debounce retries). [U5 "merged usage between multiple machine"; live race 2026-11-14, cpal-qp8.5]
  6. Append one outcome line to `usage/.sync-log` (gitignored). [U1]
- RED: temp bare remote + 2 clones (host A, host B), each records + `syncUsage` → remote tree has `usage/A.json` and `usage/B.json`, no conflict; unrelated dirty file stays dirty + uncommitted; non-main branch → no commit; rebase in progress → no commit; local non-usage commit ahead → usage committed but NOT pushed; stale `.sync-lock` → still syncs; foreign merge started between guards and merge → not aborted; push race (other host pushes in `beforePush`) → resolved within 3 attempts, and bounded at 3; debounce: second `maybeSync` within window does not spawn. [U1][U5]

## Task 4 — docs + real E2E [U5][U6]
Files: modify `README.md` (Usage tracking section: files, shape, env knobs, merge model, `stats`, callouts: sync merges origin/main into the live checkout; background commit briefly holds `index.lock`; linked worktrees do not record by default). [U5 "keep track"]
- Real run on this host after merge to `main`: `CMD_PALLET_USAGE_SYNC_MIN=0 cmd-pallet read spb-plan` → `usage/$(hostname).json` + `.cmds.json` show counts; within 30 s commit `chore(usage)` exists on `origin/main` (`git log origin/main -1 -- usage/`). [U1][U4][U5]

## Task 5 — `stats` verb [U6]
Files: create `src/usage-stats.ts` (pure: read `usage/*.json` + `usage/*.cmds.json` of ALL hosts → aggregate), modify `src/verbs.ts` (verb `stats`), `src/dispatch.ts` (route), test `tests/usage-stats.test.ts`, README Usage tracking section. [U6 "having stats"]
- `cmd-pallet stats [--top N] [--host H] [--json]` reads the merged `usage/` dir via `resolveUsageDir` (same as recording), never writes. Default N=10. [U6][U5 "merged usage"]
- Output sections [U6 "which cmd being use most , and which machine , time"]:
  1. **Top commands**: cmd | total | per host (sum over verbs read/get/run and all hours), sorted total desc, top N. [U6 "which cmd being use most"]
  2. **By machine**: host | total invocations (sum of action file) | top action, sorted desc. [U6 "which machine"]
  3. **By time**: date-hour (UTC) | total across hosts, most recent N rows; plus hour-of-day (00–23 UTC) totals. [U6 "time"]
- `--host H` filters every section to one host. `--json` prints `{ topCommands, byHost, byDateHour, byHourOfDay }`. [U6 "which machine"]
- Malformed/corrupt file → skip it with one stderr warning; empty/missing dir → "no usage recorded" exit 0. [U6]
- RED: fixture usage dir with 2 hosts → exact top-command order, per-host totals, date-hour and hour-of-day sums; `--host` filter; `--json` shape; corrupt file skipped; empty dir. [U6]
- Real run: `cmd-pallet stats` on main2 after pulling shows rows for bhd-main2, bhd-pad1, bhd-main4. [U5][U6]

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

## Gate ledger (pre-loop history)
| Plan rev | (a) covered | (b) simplest | @V |
|---|---|---|---|
| r1 | FAIL | FAIL | REVISE (8 items) |
| r2 | PASS | PASS | EXIT |
| r3 | +T5 stats [U6], +push-race bug folded into T3 step 5 | — | not gated as a whole plan → re-gated in loop round 4 |

## spb-gotcha-and-strip-loop
`round | plan SHA | gotcha findings (open/closed) | tech-lead findings (open/closed) | strip [OEn] removed | (a) | (b) | @V session id + verdict`
