---
date: 2026-10-01
source_intention: ../intentions/2026-10-01_smart-search-debate.md
source_debate: ../findings/2026-10-01_search-debate-verdicts.md
effort: 1 day senior (< 7 days, no split needed)
---

# Plan: cmd-pallet keyword-chunked search with usage frequency

## Locked decisions (from debate; do not relitigate)

1. 0 new dependencies. `fuzzyScore` stays as sub-token fallback; tests/fuzzy.test.ts contract unchanged.
2. usage.json = flat `name → count`, write ONLY on successful `run`; NODE_ENV=test / CMD_PALLET_NO_USAGE=1 skip write; missing/unwritable → count 0, no crash.
3. Two-tier precedence: S_meta (name+desc) strictly dominates S_content; content never outranks meta. Sort key [allChunksMatched, S_meta, S_content, usageCount].
4. Stemmer = 12-line suffix normalizer (-ies/-es/-s), applied to both query chunks and indexed tokens.
5. No prefix attrs, no camelCase, no decay formulas, no lastUsed. (Cut in debate, YAGNI.)

## Steps (each independently verifiable)

### S1. Tokenizer + stemmer (pure functions) — `src/fuzzy.ts`
- Add `tokenizeName(name): string[]` (split on existing SEPARATORS set, stem each), `stem(token): string` (suffix normalizer), `chunkQuery(q): string[]` (lowercase, whitespace split, stem).
- Ver: unit test — `tokenizeName("bkfw-pr-resolve")` → ["bkfw","pr","resolve"]; `stem("classes")`="class", `stem("components")`="component", `stem("class")`="class", `stem("basis")`="basis".

### S2. Two-score ranker — `src/fuzzy.ts`
- New `rankScored(commands, chunks, usage?)` → per-cmd `{meta, content, coverage, freq}`; chunk match = keyword exact/prefix > fuzzyScore(name w3/desc w2); content = fallback tier w1; AND semantics via coverage; sort by locked key #3.
- `searchCommands(commands, query, usage?)` — 3rd arg optional, default keeps current behavior when query has 1 chunk that's a linear match (S4 back-compat test proves).
- Ver: new unit test — multi-chunk order-independence ("pr resolve" == "resolve pr"), desc-match outranks content-match, name-match outranks desc-match (3/2/1 preserved).

### S3. Usage store — new `src/usage.ts` (~40 LOC)
- `loadUsage(): Map<string,number>` (missing/corrupt → empty), `bumpUsage(name)` (atomic write, skip on NODE_ENV=test or CMD_PALLET_NO_USAGE=1, never throws).
- Wire into `dispatch.ts` after successful `run` only.
- Ver: unit test — bump writes count 1, then 2; NODE_ENV=test bump → file absent; corrupt JSON load → empty map no throw.

### S4. Back-compat gate — tests
- Run existing `tests/fuzzy.test.ts` UNEDITED → must pass. If any case fails, fix in new code, never edit the old test.
- Ver: `npm test` exit 0 with fuzzy.test.ts diff == empty.

### S5. JSON + regression suite — `src/cli.ts`/`format.ts` + `tests/search-smart.test.ts`
- `--json` emits `scores: {meta, content, coverage, frequency}` (4 keys frozen).
- New test file covers: chunk-AND, stem symmetry both directions, freq tie-break, unwritable usage path, 520-cmd corpus smoke <50ms.
- Ver: full suite green; `node bin/cmd-pallet.js search "pr resolve" --json | jq .scores` shows all 4 keys.

### S6. Doc + index updates
- flow/plans + flow/findings + flow/intentions index.yml entries (flow-doc-convention R6).
- Ver: `git status` shows index.yml modified alongside; docs follow convention.

## Parallelism
S1 → S2 → S4 sequential (contract chain). S3 parallel with S2 (independent file). S5 after S2+S3. S6 last.

## Handoff
Executor: coder (h-bhd-main-coder). TDD: tests S1–S3 written first per plan-interview delegation rule — delegate test-case authorship to 2 subagents in parallel (verifier finds theater cases), consolidate before implementation.
Worktree: `wt-cp-smartsearch` via `branchlet create -n wt-cp-smartsearch -s main`.

## Effort
S1 1-2h · S2 2-3h · S3 1h · S4 0.5h · S5 2h · S6 0.5h ≈ 1 senior-day. Risk: none external; all local.
