# Debate: agy's smart-search design vs YAGNI (adjudicated)

Date: 2026-10-01 · Source design: agy in-thread (Slack origin: group cli-agents-cmd, thread 1790845526.767559)
Code ground truth: `src/fuzzy.ts` (102 lines), `src/types.ts`, `src/dispatch.ts`, `tests/fuzzy.test.ts` @ cmd-pallet 44abf06 · Corpus: 475 pi + 43 opencode cmds (cli-agent-cmd/cmds).

## Main purpose (verbatim, governs all cuts)

- "reduce the amount of search / queries by agent while still having the precise answer."
- "utilize the history nature and also the 'split -' nature of the cmd."

Purpose test: a feature passes only if it makes the AGENT issue fewer queries and still hit the right cmd on the FIRST result. Ranking cosmetics fail.

## Verdict table

| # | agy element | Verdict | Ground |
|---|---|---|---|
| 1 | Frequency/frecency from `usage.json` | ✅ KEEP (core) | History nature = explicit purpose. Zero prior state exists today — the ONLY new persistence the plan adds. |
| 2 | Two-tier score S_meta / S_content | ✅ KEEP (core) | "Have 2 score" + desc>content is explicit ask. Current code already splits fields; formalizing into 2 named tiers = ~15 LOC. |
| 3 | Dash-split keyword indexing | ✅ KEEP (core) | "split -" nature is explicit purpose. Existing `isBoundaryAt` already computes boundaries but THROWS THEM AWAY at query time — pure waste to fix. |
| 4 | Query chunking (AND semantics + coverage) | ✅ KEEP (core) | "Chunk user search and rank it match with keyword" verbatim. Chunk→keyword exact hits make the agent's first query land, cutting retries. |
| 5 | 12-line suffix stemmer (-ies/-es/-s) | ✅ KEEP | "singular and plural is kinda same" verbatim. 12 lines, no dep, bidirectional. |
| 6 | Named prefix strip (`10-`, `00-`) into `prefix` attr | ✂️ CUT | YAGNI. Boundary bonus already handles `10-ospx-explore`; a separate prefix ATTRIBUTE is dead weight unless a query needs "phase 10". Zero such queries exist. |
| 7 | camelCase tokenizer | ✂️ CUT | Corpus: `grep -c '[a-z][A-Z]'` on 475 cmd names ≈ 0. Solving a problem we don't have. |
| 8 | All-chunks-matched 2× bonus | ✂️ CUT (fold into score) | AND semantics already guarantee full-coverage ranks above partial. A separate multiplier is a redundant knob = tuning theater. Coverage ratio emitted in --json only. |
| 9 | JSON `scores: {meta, content, frequency}` | ✅ KEEP, slim | Required so the CALLER (agent) can reason about confidence → fewer blind `run` retries. Keep 3 keys, no more. |
| 10 | `NODE_ENV=test` skip-writes guard | ✅ KEEP (1 line) | Tests enforce `CMD_PALLET_CACHE_TTL=0`; must not corrupt shared usage state. |
| 11 | lastUsed timestamp | ✂️ CUT | No decay formula survives this plan (see #12). count-only. 2 fields/entry → 1. |
| 12 | log2/decay formula, min(1.5, …) caps | ✂️ CUT | Frecency decay = time-based staleness modeling. Corpus is ~520 static cmds with sparse personal usage; caps and half-lives are tuning theater. Tie-break by count, done. |
| 13 | MiniSearch / uFuzzy / pluralize deps | ✂️ REJECT | In-house already has fuzzyScore + boundary logic — R6 (forward, don't reimplement) and R4 both fail for a dep. 0-dep codebase stays 0-dep. |

## Cuts → purpose test (why the lean version still wins)

- Fewer queries: chunk→keyword exact match (3) + (4) fixes the top failure mode today — multi-word query requiring strict left-to-right char order across ONE field (`Math.max` over fields, `fuzzy.ts:77-84`). "pr resolve" today must be a linear subsequence of a single field; miss → agent re-queries. That is the retry generator.
- History: (1) only. count-tie-break ≈ frecency-lite for a static corpus; log-halves = complexity for a signal the agent never asked to see.
- Cutting 6,7,8,11,12 removes: 1 schema attr, 1 tokenizer mode, 1 scoring knob, 1 JSON field per entry, 2 formulas ≈ ~60 LOC of design mass with no query-count reduction.

## Kept design (locked)

- **usage.json** at `~/.cmd-pallet/usage.json`, flat map `"name" → count` (name is unique per catalog; agent qualifier only if collision in read-back, else skip). Written ONLY on successful `run` (not read/search — search is the retry loop we're reducing, feeding it would self-reinforce). Skip write when `NODE_ENV=test` or env `CMD_PALLET_NO_USAGE=1`. Missing/unwritable file → count 0, never crash (fail-open, matches existing cache behavior).
- **Scoring** `searchCommands(commands, query, usage?)`:
  - tokenize query → chunks (whitespace split, suffix-stemmed)
  - per command: keyword set from name split on `[-_/:. ]` (reusing SEPARATORS), each stem'd; desc tokens same treatment
  - chunk match: exact/prefix keyword hit > fuzzyScore on name/desc (weight name 3 / desc 2) > content fuzzyScore (weight 1) — content NEVER outranks a name/desc hit (2-tier precedence, sort key: [all-chunks? , S_meta, S_content, count])
  - single chunk or partial chunk still falls back to today's fuzzyScore path (back-compat: existing tests must stay green UNCHANGED)
- **--json** adds `scores: {meta, content, coverage, frequency}` — 4 keys, frozen.
- **Library call: NONE.** 0 deps preserved. `fuzzyScore` retained as the sub-token fallback so tests/fuzzy.test.ts stays the contract.

## Acceptance criteria (whole plan)

1. `cmd-pallet search "pr resolve"` ranks a `*pr-resolve*` cmd first; `search "resolve pr"` same result (order-independence).
2. `search "component"` finds `*components*` and vice versa (stem symmetry).
3. After `run` of cmd X, `search` query hitting X's keywords ranks X above equal-score sibling.
4. Existing fuzzy.test.ts passes with ZERO edits (fallback preserved).
5. New tests: chunk-AND, stem, frequency-tiebreak, NODE_ENV=test no-write, unwritable usage.json no-crash.
6. tsc --noEmit clean; `npm test` green; diff ≤ ~150 LOC net.
