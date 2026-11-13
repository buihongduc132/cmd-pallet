---
title: Usage counter — per host / action / date-hour JSON, git-synced
date: 2026-11-14
tags: [plan, spb, cmd-pallet/usage]
intentions: "[[2026-11-14_usage-counter]]"
---

# Plan — cmd-pallet usage counter

**Goal:** every cmd-pallet invocation bumps a counter in a JSON file inside this repo, and the counts get committed and pushed so all machines' usage merges in git. [U1][U2][U5]
**Architecture:** new `src/usage.ts` (pure store: key, increment, lock, atomic write) + `src/usage-sync.ts` (debounced detached git commit/push of `usage/` only). `runCli` wraps `dispatch`: after the verb finishes, record usage; any usage error is swallowed (never changes exit code or output).
**Worktree (pinned):** `/data/worktrees/cmd-pallet-wt--wt-usage-counter` on branch `wt/usage-counter` from `main`. All Tasks run there.
**Tech:** Node ≥22.18 strip-types TS, `node:*` only, vitest.

## Data contract [U3][U4]
- `usage/<hostname>.json` → `{ "<hostname>": { "<action>": { "YYYY-MM-DDTHH": n } } }`
- `usage/<hostname>.cmds.json` → `{ "<hostname>": { "<cmd>": { "<action>": { "YYYY-MM-DDTHH": n } } } }` — only `read`, `get`, `run` (verbs that take one cmd); `<cmd>` = resolved command name when found, else the name as typed.
- date-hour = UTC. hostname = `os.hostname()`. action per intention [U2].
- Keys written sorted → stable diffs.

## Env knobs
- `CMD_PALLET_USAGE=0` → disable record + sync (whole test suite sets it via `vitest.config.ts` `test.env`).
- `CMD_PALLET_USAGE_DIR` → override store dir (default `<repo>/usage`, repo = parent of `src/`).
- `CMD_PALLET_USAGE_SYNC_MIN` → debounce minutes (default 10).

## Task 1 — usage store [U1][U3][U4]
Files: create `src/usage.ts`, `tests/usage.test.ts`.
- `dateHourKey(d: Date): string` → UTC `YYYY-MM-DDTHH`.
- `actionOf(parsed, verbDef)` → action string per [U2].
- `recordUsage({dir, host, action, cmd?, now})`: lock (`mkdir <dir>/.lock`, stale after 10 s, retry ≤ 50 × 20 ms; give up silently), read JSON (missing/corrupt → `{}`; corrupt file renamed `*.corrupt-<ts>`), increment, write sorted JSON to tmp + `rename`.
- RED first: tests for key format, first increment, repeated increment same hour, new hour new key, cmds file only when `cmd` given, 20 parallel `recordUsage` calls → count 20, corrupt file recovery.
- Pass: `npx vitest run tests/usage.test.ts`.

## Task 2 — wire into CLI [U2]
Files: modify `src/cli.ts` (`runCli`), `src/dispatch.ts` (set `io.usage.cmd`), `src/types.ts` (`IoStreams.usage?`), `vitest.config.ts` (`test.env: { CMD_PALLET_USAGE: "0" }` — covers spawned-bin tests in `smoke`/`regression-defects` that pass `...process.env`), create `tests/usage-cli.test.ts`.
- `runCli(argv, io)`: `try { return await dispatch(...) } finally { try { recordInvocation(argv, env, io.usage) } catch {} }`. Read `env` from `io?.env ?? process.env`.
- `<cmd>` = resolved name: `dispatch` sets `io.usage = { cmd: <resolved name> }` (new optional field on `IoStreams`) after `findCommand` succeeds in read/get/run; not found/ambiguous → name as typed. No second catalog load. [U6 "which cmd being use most" needs one key per cmd]
- `runCli` records in `finally` (dispatch throwing still counts); the record call has its own `try/catch` → never changes exit code/output.
- RED: via `runCli` with temp `CMD_PALLET_USAGE_DIR`: `list` → `list` count 1; `read <x>` → actions + cmds file; unknown verb → `unknown`; `--version` → `version`; failing store dir (file in place of dir) → exit code unchanged, stdout unchanged.
- Full suite still green: `npx vitest run`; and `git status --porcelain usage/` empty after it (suite never writes real store).

## Task 3 — git sync [U1][U5]
Files: create `src/usage-sync.ts` (also worker entry: `node src/usage-sync.ts <repoDir>`, Node ≥22.18 strips types), `tests/usage-sync.test.ts`; modify `.gitignore` (`usage/.lock`, `usage/*.tmp*`, `usage/*.corrupt-*`, `usage/.sync-*`).
- `maybeSync({repoDir, usageDir, now, debounceMin})`: if `usageDir` not inside `repoDir` git worktree → skip. If `<usageDir>/.sync-stamp` mtime < debounce → skip. Else touch stamp, spawn `node src/usage-sync.ts <repoDir>` detached, `stdio: 'ignore'`, `unref()`.
- Worker `syncUsage(repoDir)` (sync, exported for tests). Every git call: `execFileSync('git', [...], {cwd, timeout: 60000, env: {...env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes'}})`. Lock `usage/.sync-lock` dir, stale after 5 min → break.
  0. Guards → skip whole sync: merge/rebase/cherry-pick/bisect in progress (`git rev-parse --git-path MERGE_HEAD|rebase-merge|rebase-apply|CHERRY_PICK_HEAD|BISECT_LOG` exists); detached HEAD; branch ≠ `main` or upstream ≠ `origin/main` (worktree branches never commit usage → no merge conflict later).
  1. `git add -- usage/*.json`; nothing staged for usage → stop.
  2. `git commit -m "chore(usage): <host> <iso>" -- usage/` (commits ONLY usage paths; other dirty files untouched).
  3. `git fetch`. If HEAD has commits ahead of `@{u}` that touch paths outside `usage/` → stop (never push someone else's unpushed work; local commit stays, pushed by a later sync once they push).
  4. If behind: `git merge --no-edit @{u}` (git refuses if it would overwrite dirty files → `git merge --abort`, stop). ACCEPTED: this pulls origin/main into the live checkout like `git pull` would (README callout).
  5. `git push`. Failure → stop (next debounce retries).
  6. append one line to `usage/.sync-log` (gitignored).
- RED: temp bare remote + 2 clones (host A, host B), each records + `syncUsage` → remote tree has `usage/A.json` and `usage/B.json`, no conflict; unrelated dirty file stays dirty + uncommitted; non-main branch → no commit; rebase in progress → no commit; local non-usage commit ahead → usage committed but NOT pushed; stale `.sync-lock` → still syncs; debounce: second `maybeSync` within window does not spawn.

## Task 4 — docs + real E2E [U5][U6]
Files: modify `README.md` (Usage tracking section: files, shape, env knobs, merge model, callouts: sync merges origin/main into the live checkout; background commit briefly holds `index.lock`).
- Real run on this host after merge to `main`: `CMD_PALLET_USAGE_SYNC_MIN=0 cmd-pallet read spb-plan` → `usage/$(hostname).json` + `.cmds.json` show counts; within 30 s commit `chore(usage)` exists on `origin/main` (`git log origin/main -1 -- usage/`).

## Out of scope
Stats verb [U6 "later on"]; pi `cmd_palette` tool in pi-cmd-palette repo (separate code path — call out).

## Gate ledger
| Plan rev | (a) covered | (b) simplest | @V |
|---|---|---|---|
| r1 | FAIL | FAIL | REVISE (8 items) |
| r2 | PASS | PASS | EXIT |

## Final verification
`npx tsc --noEmit`, `npx vitest run` all green; real E2E of Task 4; `superpower-requesting-code-review` on the branch diff; merge `wt/usage-counter` → `main`, push.
