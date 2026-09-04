# Investigator B — chain runner upgrades (read-only probes, all live-verified 2026-09-06)

## Probes & evidence

**P1. pi `-p` text mode does NOT stream.** `timeout 45 pi -p 'count 1-10 slowly'` → stdout 0 bytes at t=4..32s, entire output flushed only at exit (rc=0). Print mode emits final message only; there is nothing to tee live. **pty would NOT help** — no TTY-gating observed in print modes; pty only matters for TUI.

**P2. pi `--mode json` streams.** `pi --mode json -p` piped: 0→127→2,127→23,598 bytes over 24s. NDJSON per docs/json.md (first line `{"type":"session",...}`, events `agent_start/turn_start/message_start/message_update/text_delta/message_end/tool_execution_*/turn_end/agent_end/agent_settled`). `message_update` = delta-only; `message_end` = authoritative final. 235 lines for a trivial run → tee raw + filter.

**P3. agy streams too.** `agy --output-format stream-json -p='…'` piped: 0→1,378→2,042 bytes. 4 events: `init / step_update×2 / result` (`result.result.response` = final text). Gotcha: `-p` swallows next token — must use `-p='prompt'`; current runner argv (prompt last, separate) is OK.

**P4. SIGTERM on pi: clean exit, rc=143, <1s.** No hang, no SIGKILL escalation needed. JSON mode mid-turn kill: partial NDJSON retained (9-10 lines incl. partial `message_start`), no `agent_end` — kill is unambiguous in meta. Text mode kill: **0 stdout bytes — total loss**.

**P5. Orphaning confirmed.** Default `Popen` (no new session) + SIGTERM child → grandchild stayed alive. `start_new_session=True` + `os.killpg()` → whole group dies. Current runner uses `subprocess.run` (no group): runner SIGKILL/SIGTERM → pi/agy orphaned, burning tokens up to 240min.

**P6. 16KB "truncation" root cause = `process.exit()` race, not pipe cap.** `cmd-pallet read --json` piped: 16,384 / 16,384 / 8,192 / 8,024 bytes across runs (nondeterministic). Same command to a **file**: 26,269 bytes, JSON parses clean. Culprit: `bin/cmd-pallet.js:2,21-24` — async pipe write pending when `process.exit()` fires (TTY flushes sync, pipes don't). **Severity HIGH: current chain runner `read_command` (cmd-pallet-chain.py:60-77, `capture_output=True` pipe) is loading silently truncated cmd content right now** — 10-findings-persist loads 8,020/25,478 bytes via runner path.

**P7. E2BIG at ~131KB argv** (`MAX_ARG_STRLEN`): 140KB arg → `OSError 7` unhandled in runner. pipe-all chains with 25KB cmds × several hops can exceed this. pi documented: piped stdin merges into prompt (`cat x | pi -p "..."`) — prompts can move off argv.

**P8. Meta written only post-hop.** `write_hop_log` (cmd-pallet-chain.py:187) runs after `run_agent` returns; `run.meta.json` only on full success. Killed mid-hop → zero state for that hop; killed mid-run → no run-level status.

## Recommended upgrades (ranked value/effort)

1. **[P0, ~5 lines] Temp-file redirect in `read_command`** — `subprocess.run([...], stdout=open(tmp,'w'))` then read file. Bypasses P6 entirely, full content guaranteed. Fixes silent prompt corruption TODAY.
2. **[P0, ~10 lines] Incremental meta + status heartbeat** — write `hop.meta.json {status:"running", pid, startedAt}` before spawn; update to `done|failed|timeout` after; `run.meta.json {status:"running"}` at start → `completed`. Killed chain leaves inspectable state (P8).
3. **[P1, ~25 lines] Process group + signal handling** — `Popen(start_new_session=True)`; install SIGTERM/SIGINT handler → `os.killpg(pgid, SIGTERM)`, wait ≤10s, SIGKILL, mark meta `status:"killed"`. Prevents 240min orphans (P5). pi dies clean on TERM (P4).
4. **[P1, ~40 lines] pi hops → `--mode json` + live line-tee** — stream NDJSON to `hop.ndjson` (crash-safe partials, P2/P4) while filtering `message_end`/`text_delta` into incremental `hop.output.md`; final text from last assistant `message_end`; rc≠0 or missing `agent_end` = failed hop. Kills streaming-blindness AND text-scraping fragility. No pty needed (P1/P2).
5. **[P2, ~5 lines] agy hops → `--output-format stream-json`** — tee + parse `result.response` (P3); same crash-safety.
6. **[P2, ~8 lines] Prompt via stdin when len(argv-prompt) > ~100KB** — avoids E2BIG (P7); pi merges stdin into prompt.
7. **[P3, 1 line] Upstream fix cmd-pallet.js** — drop `process.exit()`, set `process.exitCode` only (lets stream drain); or `await new Promise(r=>process.stdout.once('drain',r))` before exit. Do both: runner still uses temp-file (defense in depth).
8. **[P3, optional] `--mode rpc`** exists (docs/rpc.md, LF-delimited JSONL, bidirectional) — overkill for one-shot hops; json mode sufficient.

## Residual risks
- json-mode event schema versioned (`session.version:3`) — pin tolerance to v3 shapes.
- agy stream-json requires `-p=` form if flags follow prompt; keep prompt last or use `=`.
- broken-extension cwd sensitivity NOT addressed here (env issue, prior commit 6bd1e79); `--mode json` orthogonal to it.
