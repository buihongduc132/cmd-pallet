# Investigator A — pi -p env-blindness + agy long-run flags (2026-09-04)

## Verdict (short)
- (1) Bug is DEAD. `_ is not defined` occurred 2026-09-04 22:03 when settings.json wired open-goal-client by LOCAL ABSOLUTE PATH into ~/Documents. Repo commit `4ef1ed8` ("pi client = remote-git-main install only") re-wired to `git:github.com/buihongduc132/open-goal`. Today the extension loads from `~/.pi/agent/git/github.com/buihongduc132/open-goal/client/pi/open-goal-client/index.ts` (609 lines, byte-identical to working tree, zero bare `_` identifier).
- Correct invocation = plain `pi -p` (NO new flags). Works in /tmp AND project dirs, no -ne, no behavior change. Ext-load failure is FAIL-FAST LOUD: stderr error + empty stdout + rc=1 (probed with injected broken ext). `cmd-pallet-chain.py` already propagates rc + `[stderr]` → env-blindness is detectable, never silent.

## Probe evidence
| # | Command | Result |
|---|---------|--------|
| 1 | `cd /tmp && pi -p "reply OK"` ×5 | rc=0, "OK" every run — no repro |
| 2 | `pi -p --verbose` /tmp | zero extension errors |
| 3 | Yesterday's exact smoke: `./bin/cmd-pallet-chain.py --chain "gotcha-coverage" --requirement "probe smoke: just echo OK" --workdir /tmp --json` | `exitCode:0, status:completed` (log `/tmp/.cmd-pallet-chain-logs/20260904-232224`) |
| 4 | `pi -e /tmp/broken-ext.ts -p` (injected throw) | stderr `Error: Failed to load extension ... BOOM_XYZ`, stdout EMPTY, rc=1 → fail-fast semantics proven |
| 5 | `env -u OPEN_GOAL_URL pi -p "value of OPEN_GOAL_URL?"` | child still sees `http://127.0.0.1:4760` — settings.json `env` block RE-INJECTS regardless of shell env; unsetting in argv/env CANNOT gate the ext |
| 6 | project-dir `pi -p "PONG"` | PONG, rc=0 |

## Root-cause chain (why parent saw it)
1. Old wiring: extension registered by absolute path → local edit (broken `_`) instantly poisoned every `pi -p` in ANY cwd. No cwd-gating exists (gate = `OPEN_GOAL_URL` env ‖ `.pi/open-goal-client.json`), so "non-project cwd" was coincidental, not causal.
2. Fix already shipped (4ef1ed8 + deploy to `~/.pi/agent/git/...`). AGENTS.md lesson re `.git`-stripped checkouts: `ls -d` check passes (`.git` present as dir).

## Flags probed — no better option than plain `pi -p`
- `--exclude-tools, -xt`: tools only, does NOT skip extension LOAD → useless here.
- `-e <path>`: additive only, cannot subtract.
- `pi config`: interactive TUI, unusable in `-p`.
- No `PI_EXTENSIONS=0`-style env exists (dist greps: only `PI_OFFLINE`, `PI_CODING_AGENT_DIR` etc; none gate extensions).
- Conclusion: no per-invocation single-extension disable exists. Robustness = current state (rc/stderr surfacing) + keeping ext healthy in source-of-truth.

## Residual risk (real, not yesterday's bug)
- `OPEN_GOAL_URL` injected into EVERY pi process; if server at :4760 is UP and a goal is ACTIVE, ext injects `[GOAL CONTINUATION] Continue working...` into chain hops (observed in /tmp session 2026-09-04T15:04). Server DOWN → `api()` fail-open null (harmless). For chain determinism, either keep server down during chains or pause goals. THIS is the live contamination vector, NOT ext-load crash.

## agy long-run (failure 2)
- `--print-timeout 240m0s` (set) — the ONLY timeout flag; default 5m0s.
- No stream/output timeout exists beyond it.
- Optional hardening (not required): `--disable-slash-commands` — chain prompts embed literal `# /gotcha-coverage`-style lines; print-mode slash expansion could misinterpret a hop whose instruction begins with `/`. `--output-format json` only if parent needs machine-parsed hops; default `text` fine for piping.
- Verdict: 240m0s suffices; add `--disable-slash-commands` as cheap insurance.

## Poor-progress log (per user demand, 5 items)
1. Re-running /tmp repro ×5 — zero repro; premise stale.
2. Hunting bare `_` in ext source ×5 greps + `git log -S` + all-rev — zero hits (bug was in since-fixed code).
3. Session grep hit wrong dirs ×4 before finding error in dy-flow parent session (timestamped 22:03, not today).
4. Source-of-wiring flipflop: yesterday absolute-path load vs today `git:` package — resolved via repo commit 4ef1ed8.
5. Broken-ext rc check invalid once (rc captured post-pipe) → re-ran clean: rc=1 confirmed.

## Recommended next steps
1. Chain: keep `["pi", "-p", prompt]` verbatim; add hop-fail guard on rc≠0 (already returns rc — verify main() dies exit-4; smoke shows exitCode surfaced).
2. agy: append `--disable-slash-commands` to argv in `run_agent()`.
3. Chain runs during active goals: pause goal or accept `[GOAL CONTINUATION]` injection.
4. None of this needs code change today — both fixes already live.
