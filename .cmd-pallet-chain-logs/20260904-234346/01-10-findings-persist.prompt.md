this is user requirement : t
This is previous context :
<<<PREV_CONTEXT
<none>
PREV_CONTEXT>>>

<<<INSTRUCTION
# /10-findings-persist (loaded dynamically from cmd-pallet)
# 10-findings-persist
argument-hint: [explore-topic-or-name]

$ARGUMENTS

→ Chain: `~/.pi/agent/cmd-family/findings.yml` (step 10)

## GOAL

Persist CURRENT explore-mode conversation as structured transcript findings at `./flow/findings/<date>-<name>/`.

DOD:
- Every user turn captured VERBATIM (trust chain L1).
- Every assistant turn captured AS-IS — ALL of: prose, tables, code blocks, command outputs, diagrams, ASCII charts, decisions, corrections, callouts. NOTHING stripped/summarized/paraphrased.
- Fresh reader resumes from files alone — sees EXACT same content live conversation produced.
- NO new analysis/decisions/content. Docs only.
- `references.md` lists all sources.
- Dir listing shows per-turn thread/decision stats.
- Blocker + deferral analysis after dir listing — reader knows what MUST be decided before implementation + what ships despite deferral.

## HARD RULE — NOTHING IS DISPOSABLE (read first, violates = redo)

Cmd exists to preserve. Token economy NOT a goal. Brevity NOT a goal. "Saving space" FORBIDDEN as motivation.

What "as-is" means — ALL these MUST appear in turn file if in original assistant turn:
- Tables (markdown, ASCII boxes) — reproduced cell-by-cell, every row/column.
- Code blocks (fenced ```) — byte-for-byte, incl comments.
- Command outputs (stdout/stderr pasted) — in full.
- ASCII diagrams / box-drawing — exactly.
- Bullet/numbered lists — every item.
- Callouts ([CA1], [R1], evidence tags) — kept with IDs.
- Turn headings/section structure — preserved.
- Numbers / counts / ratios — exact, not rounded.
- URLs / file paths — exact, not elided.

Tables and code = CONTENT, not formatting. Strip table = strip finding. Turn w/ 5 tables MUST produce file w/ 5 tables. Turn pasting 200-line output MUST reproduce those 200 lines.

Large turn (e.g. 5 tables + 3 code blocks + 200 lines) → large file. CORRECT. Do NOT "merge"/"summarize"/"condense" to shrink. Large turns → large files. Truth > tidiness.

## Location / naming

Root: `./flow/findings/<date>-<name>/`

`<date>` = date of FIRST session on this topic (YYYY-MM-DD). STAYS FIXED — does NOT change on subsequent sessions. = first-appearance date.

`<name>` = explore TOPIC, snake_case, ≤5 words, action-first. Use user's name if given. Else derive from first user message.

### First session on this topic

`<date>-<name>/` NOT exist → create. Layout:

```
./flow/findings/<date>-<name>/
├── README.md
├── references.md
├── solutions/                         (populated by step 25 solve-blockers)
├── <date>-turn1-<slug>.md
├── <date>-turn2-<slug>.md
├── <date>-locked-decisions.yaml   (if any locked decisions)
└── <date>-open-threads.yaml        (if explore ongoing)
```

### Subsequent sessions on same topic (DIR ALREADY EXISTS)

`<date>-<name>/` exists → new work in subdir `<date>-<name>/<topic>/`:

```
./flow/findings/<date>-<name>/
├── README.md                          ← UPDATE: add 3-5 line summary for new topic
├── <prior-session-files>.md           ← leave untouched
└── <new-topic>/                       ← new session here
    ├── <date>-turn1-<slug>.md
    ├── references.md
    └── ...
```

`<topic>` = date, sub-aspect, or phase (e.g. `2026-06-20-explore`, `verifier-r1`).

### README.md

ALWAYS at `<date>-<name>/README.md`, NEVER in subdir. Format:

```markdown
# <Name>

> Date range: <first> → <last>
> Status: <research-only | explore-ongoing | proposal-written | rejected | done>

## Topics

### <topic-1> (<date>)
<3-5 line summary: what explored, what concluded, what open>

### <topic-2> (<date>)
<3-5 line summary>

## Pick up next time
1. <first file to read>
2. <second file>
3. <open decision / next step>
```

Update README on EVERY new topic. DO NOT rewrite prior summaries.

### references.md

ALWAYS at `<date>-<name>/references.md` (or `<date>-<name>/<topic>/references.md` for subdir). Format:

```markdown
# References

> Sources consulted during this explore session.

## Source files
- `<path>` — what it contains, why referenced

## Documents
- <URL or path> — what it covers

## Code patterns
- <description> — where found, relevance
```

MUST include every file read, every external doc, every code pattern referenced. Fresh reader uses this to understand what informed explore.

## Steps

1. **Identify `<date>`, `<name>` and `<topic>`.** `<date>` = today (first session). Read first user message. Derive snake_case name. Check `<date>-<name>/` exists → top-level or subdir layout.

2. **Scan conversation.** List every user+assistant turn. For EACH assistant turn, inventory content types (tables, code, diagrams, prose, callouts). Reproduce ALL.

3. **Pick turn granularity.** One file per turn. Period.
   - DO NOT merge turns — even if tiny. 2-line user + 1-line assistant gets own file.
   - DO NOT skip turns.
   - Split ONLY if single turn genuinely too large for one readable file (>~400 lines reproduced). If split: content CONTIGUOUS across files (file N ends mid-table → file N+1 continues that exact table), no omission, both files cross-reference, split noted in README.
   - Target: 5-15 files for normal explore. More fine if warranted.

4. **Write per-turn files FIRST.** Each file:
   - Header: `# Explore Turn N — <slug>` + date + phase + status.
   - `[user]` blocks: verbatim, quoted with `>`, marked "(verbatim — trust chain L1)" on first occurrence per file.
   - `[assistant]` blocks: REPRODUCE FULL TURN OUTPUT. Every table, code block, command output, diagram, bullet, callout — exactly as appeared. 15-row table → file has 15-row table. 50 lines code → file has 50 lines code.
   - End: "Status at end of turn N" + pointer to next turn.
   - NO re-analysis. NO insights not in original turn.
   - NO cleanup of user wording (profanity/typos/CAPS = signal). KEEP.
   - NO cleanup of assistant formatting. ASCII boxes → reproduce ASCII boxes.

5. **MIGRATE legacy `.md` cross-turn files to `.yaml` (MANDATORY).** Before writing new, scan `<date>-<name>/` (and `<date>-<name>/<topic>/`) for legacy:
   - `*-locked-decisions-canonical.md`
   - `*-open-threads.md`
   For EACH legacy file:
   - Read content.
   - Convert to `.yaml` using schemas in step 5b. Extract `turn` + `parts` from `[Tn]` tags / section headings. Extract `user_quote` from verbatim `> **[user]**` blocks — DO NOT paraphrase.
   - Write new `.yaml` alongside (same date prefix, new extension).
   - DELETE legacy `.md`. DO NOT leave both — dual format breaks traceability.
   - Note migration in README under topic entry (one line: `migrated locked-decisions.md → .yaml`).
   Hard migration. No legacy `.md` cross-turn files may remain after run.

5b. **Write NEW cross-turn reference files (YAML).** Only if applicable:
   - `<date>-locked-decisions.yaml` — all locked decisions. MANDATORY fields per entry:
     ```yaml
     - id: LD1
       turn: <turn-id>          # e.g. turn1, turn4. WHERE locked.
       parts: ["C1", "R1"]      # list of section/heading ids INSIDE that turn file
                                # (Cause / Recommendation / Decision block ids)
       user_quote: |            # VERBATIM user text that locked it. block scalar.
         "<exact user words — profanity/typos/CAPS kept>"
       decision: <one-line summary of what got locked>
       status: locked           # locked | superseded
     ```
     IMMUTABLE INPUT to future proposals. Traceability: future artifact MUST cite `[LD1]`, reader jumps to `turn4 → C1+R1 → verbatim quote`.
   - `<date>-open-threads.yaml` — unresolved items + per-thread status. MANDATORY fields:
     ```yaml
     status: ongoing             # top-level: ongoing | closed
     threads:
       - id: OT1
         topic: <short>
         raised_in: <turn-id>    # where first surfaced
         status: open            # open | resolved | deferred | superseded
         resolution: <text>      # only if status != open
         resolved_in: <turn-id>  # only if resolved
         severity: <rank>        # optional — 1..5 if gotcha-coverage ranked it
         note: |                 # optional — context/mitigation
           <text>
     ```
   - Skip if none applicable.

6. **Handle delegated worker outputs.** If explore spawned workers (teams, ACP, etc.):
   - DO NOT move/duplicate worker's deliverable file into `<date>-<name>/`.
   - Solutions written by step 25 (solve-blockers) land in `<date>-<name>/solutions/`. Cross-reference from turn file.
   - Cross-reference by full path in turn file.
   - REPRODUCE load-bearing content from worker output INTO turn file VERBATIM — tables, conclusions, numbers, code. NOT a summary. Worker's 20-row results table → turn file reproduces that 20-row table (w/ one-line "full output: `<path>`" note above). Only skip pure boilerplate/logs carrying no decision-relevant signal.
   - Unsure whether worker content load-bearing → reproduce it. Err toward MORE.

7. **Write references.md.** List every source file read, doc consulted, code pattern referenced during explore. Include path/URL + one-line why. Group by type: Source files, Documents, Code patterns.

8. **Update (or create) README.md.** Add session as new topic, 3-5 line summary. If pre-exists, PRESERVE prior entries — only append.

9. **Final sanity pass + directory listing.** Read README + first turn + last turn + locked-decisions. Verify: fresh reader resumes from these alone. Fill gaps if not.

   Then produce directory listing with per-turn stats. Format:
   ```
   <date>-<name>/
   ├── solutions/                            Solutions: <count> (if solve-blockers ran)
   ├── <date>-locked-decisions.yaml          Decided: <total>
   ├── <date>-open-threads.yaml              Remain: <open> (<total> total; <resolved> resolved; <deferred> deferred)
   ├── <date>-turn1-<slug>.md                Threads: <cumulative>; decided: <cumulative>; remain: <open>
   ├── <date>-turn1a-gotcha-<slug>.md        (appendix) Gotchas: <count>; rank5+: <n>; rank4: <n>   ← only if gotcha-coverage ran
   ├── <date>-turn2-<slug>.md                Threads: <cumulative>; decided: <cumulative>; remain: <open>
   ├── <date>-turn2a-gotcha-<slug>.md        (appendix) Gotchas: <count>; rank5+: <n>; rank4: <n>   ← only if gotcha-coverage ran
   ├── references.md
   └── README.md
   ```

   Per-turn stats meaning:
   - `Threads: X` = total threads raised in open-threads.yaml up to this turn (cumulative).
   - `decided: Y` = total decisions locked in locked-decisions.yaml up to this turn (cumulative).
   - `remain: Z` = threads still open at this point (X minus resolved).

   Appendix stats (only if gotcha-coverage / step-20 appendix files exist):
   - `Gotchas: N` = count of gotchas documented in that appendix.
   - `rank5+: <n>` = count of rank-5 (sophisticated/fundamental) gotchas.
   - `rank4: <n>` = count of rank-4 (significant) gotchas.

   Cross-turn file stats at bottom:
   - `locked-decisions.yaml  Decided: <num>` = total locked decisions.
   - `open-threads.yaml  Remain: <num>` = total open threads.

10. **Blocker + deferral analysis.** Produce TWO sections AFTER the directory listing. Reader must walk away knowing: (a) what physically blocks implementation + must be decided NOW, (b) whether the implementation can ship anyway with reduced coverage.

    ### Section (a) — BLOCKERS (must-decide-before-implementation)

    Scan `open-threads.yaml`. Identify threads that BLOCK implementation. Test:

    > **Blocker test** = "Can implementation physically START without resolving this thread?"
    > - YES (can start, just reduced coverage) → NOT a blocker. Goes to section (b) deferral.
    > - NO (next action literally cannot proceed) → BLOCKER.

    NOT a blocker (per base.md guidance): needs-rerun, needs-approval, orthogonal risk, nice-to-have, optimization, future concern. These are NEXT-STEPS, never blockers.

    Per BLOCKER, 3-5 lines MAX:
    ```
     OTx — <topic>  [severity: rank N or "unranked"]
       <one-line summary of the thread>
       Suggested approach: <pulled from original turn mitigation OR gotcha-coverage mitigation>
       Why it blocks: <one line — what action is physically stopped>
    ```

    Sort by severity (rank 5 first; unranked last). If NO blockers → state explicitly: `"No blockers — all open threads deferrable with reduced coverage."`

    ### Section (b) — DEFERRAL FEASIBILITY

    For EACH blocker from (a): can implementation proceed with THIS blocker deferred (reduced coverage)?

    ```
     OTx — <topic>
       Defer? YES / NO
       Lost if deferred: <one line — what functionality/coverage is gone>
    ```

    Then GLOBAL verdict at bottom:
    ```
     ── Global deferral verdict ──
     If ALL blockers deferred, implementation feasible? YES / NO
     
     [If YES]
     Ships now: <bullet list of what works>
     Deferred (reduced): <bullet list of what's gone / partial>
     
     [If NO]
     Minimum blocker set that MUST be resolved before implementation:
     - OTx — <reason>
     - OTy — <reason>
    ```

    HONESTY: if a blocker genuinely cannot be deferred, SAY SO. Do not soften. Auditor tone. The point of section (b) is to expose whether "defer and ship" is real or cope.

## MUST follow

- **Verbatim preservation.** User words quoted with `> **[user]**` prefix. Mark "(verbatim — trust chain L1)" on first occurrence per file. Profanity/typos/CAPS = signal. KEEP.
- **As-is assistant reproduction.** Every table, code block, command output, diagram, bullet, callout from assistant turn → reproduced in turn file. Tables and code = CONTENT. (See HARD RULE above.)
- **Transcript structure.** `[user]` / `[assistant]` blocks alternate. Reader sees conversation shape, not sanitized summary.
- **Source tagging.** Every locked-decision YAML entry MUST carry `turn` + `parts` + `user_quote` (verbatim). Enables tracing decision → exact turn + section + user words.
- **Hard YAML migration.** Legacy `*-locked-decisions-canonical.md` + `*-open-threads.md` MUST convert to `.yaml` + legacy `.md` DELETED. No dual format. No deferral.
- **Per-turn files.** One file per turn. No merging. No skipping.
- **Cross-turn files separate.** Locked decisions and open threads get OWN files — findable without scanning every turn.
- **Bridge prior sessions.** If `<date>-<name>/` pre-existed, README covers old + new. Old files untouched.
- **Status line per file.** Each turn file ends with "Status at end of turn N" + pointer to next.
- **Retroactive callbacks.** If later event changes earlier turn's reading, add "Callback" section at BOTTOM of earlier turn file. DO NOT rewrite turn.
- **references.md mandatory.** Every explore MUST produce references.md. List all sources. No exceptions.
- **Per-turn stats mandatory.** Directory listing MUST show cumulative thread/decision counts per turn.
- **Blocker honesty.** Section (a) MUST distinguish true blockers from next-steps. If thread can be deferred with reduced coverage → NOT a blocker. Do NOT inflate blocker list (cope) and do NOT deflate (silent ship-blocker).
- **Deferral honesty.** Section (b) MUST say NO when deferral genuinely blocks. Do not manufacture "ship anyway" verdicts. Reduced-scope honesty > false ship.

## MUST AVOID

- **NO re-analysis during documentation.** Preservation, not redo. New insight found while writing → `open-threads.yaml` as NEW thread, not into past turn.
- **NO cleanup of user wording.** No editing profanity. No fixing typos. No paraphrasing. User wrote "what the FUCK" → file says "what the FUCK".
- **NO stripping/condensing assistant output.** No "summarize this table". No "omitted for brevity". No "key rows only". No replacing table with one-line summary. In the turn → in the file.
- **NO moving large research files.** Worker wrote 20KB deliverable elsewhere → cross-reference AND reproduce load-bearing content verbatim (see step 6). Moving breaks links; duplicating whole file bloats; silent summarization is worst option.
- **NO merging sessions or turns into one file.** One file per turn. 1500-line monolith = unreadable.
- **NO skipping locked decisions.** User locked ANY decision (verbatim "yes/no/pick X") → MUST be in `locked-decisions.yaml`. Missing one = future proposal violates it = verifier REJECT.
- **NO overwriting existing README.** Append new topic. Preserve prior entries verbatim.
- **NO inventing `<name>` if user gave one.** User said "document the X explore" → `<name>` = X.
- **NO adding new diagrams.** Only reproduce diagrams/tables/code from original turns. NEW diagrams = new analysis = forbidden. Reproducing EXISTING ones = mandatory.
- **NO pretty-formatting assistant output.** Plain markdown. No emoji where none. No callout boxes where none. Strong wording fine ("MUST", "NOT"); visual noise not.
- **NO skipping references.md.** Read a file → goes in references.md. No exceptions.
- **NO inflating blocker list.** "Needs-rerun" / "needs-approval" / "orthogonal-risk" / "future concern" = NEXT-STEP, NOT blocker. Section (a) lists TRUE blockers only.
- **NO manufacturing deferral verdicts.** If defer = broken implementation, SAY NO. Do not soften to make user feel better.

## Tips / tricks

- **Date-prefix every file.** `<YYYY-MM-DD>-<slug>.md`. Sorts chronologically. Disambiguates same-named turns across sessions.
- **Trust chain levels.** Verbatim user = L1. Worker/verifier outputs = L2 (derived). Assistant conclusions = L3 (interpretation). Readers know what to challenge.
- **Quote user corrections in full.** User corrects assistant ("X is WRONG, do Y") → FULL correction in file incl quoted wrong thing. Delta = value.
- **Cross-reference, don't repeat.** Turn 5 references turn 2's locked decision D4 → write `[T2 D4]` not full text. (Cross-turn REFS only, not reproducing current turn's own content.)
- **Use `> [user]` blockquote prefix.** Visually distinct from assistant prose. Renders cleanly.
- **Number turns from 1.** Even if documenting turns 3-8 (skipping small talk), keep original numbers for cross-ref accuracy.
- **Name workers if delegation happened.** `@research-teams-staleness`, `@verifier-1`, etc. Readers find outputs by name.
- **Open dir with `eza --tree --level=2`** to verify structure before declaring done.
- **Build per-turn stats incrementally.** As you write each turn, update running counts of threads raised and decisions locked. Final listing reads from your counts.
- **references.md as you go.** Don't wait until end. Add each time you read new source. Prevents forgetting.
- **Inventory content types per turn BEFORE writing.** Step 2 lists what each assistant turn contained (tables/code/diagrams). Use as checklist while writing — every item checked off. Prevents "forgot to copy the big table".
- **Blocker test = "can I start coding NOW without this decision?"** If yes (even with degraded coverage) → next-step. If no → blocker.
- **Deferral verdict = auditor honesty.** Imagine shipping anyway. What BREAKS? If "nothing important" → YES. If "core functionality gone" → NO. State both honestly.
- **Severity sort blocker list.** Rank 5 first. Reader scans top of section (a) and immediately sees the worst. If rank missing, infer from `note:` text or original turn severity tags.

## Useful references

- Explore mode skill/prompt: `/opsx-explore` or equivalent on this machine. Read before invoking.
- Verifier-loop skill (if explore ended with verification): `references/verifier.md` = detective policy verifiers applied. Cite in verifier-round turn file.
- Teams skill (if explore used delegation): defines worker result storage. Cross-reference team task dir.
- Existing `flow/findings/<date>-<name>/` README — source of truth for what's documented. READ FIRST before writing.
- Step-20 gotcha-coverage cmd — produces appendix files referenced in Step 9 directory listing. If you re-run step 10 after step 20, appendix files will be present.

## Mistakes / lessons learned

- **Stripping tables to save tokens (2026-07-08 incident).** Agent documented an explore, replaced 30-row migration table with one-line "delivered full table" summary. User caught it: "Where the fuck is the large chunk of table here." Root cause: cmd said "diagrams, decisions, prose" — didn't explicitly mandate tables/code/output, so agent treated them as disposable formatting. FIX: HARD RULE section + "as-is assistant reproduction" obligation. Tables are CONTENT. Verify by inventorying content types per turn (step 2), check each off.
- **Inverting locked decision silently.** Later turn/proposal contradicts user-locked decision → deviation MUST be surfaced explicitly in Decision Log with rationale. Silent inversions → verifiers REJECT.
- **Stripping "verify before build" hedges.** Research flagged open question → DO NOT promote to hard requirement without resolving. Preserve hedge or run probe.
- **Burying HUMAN REMINDERS in footnotes.** User said "remind me afterward" → footnote in tasks file NOT a reminder. Move to visible tracker (stub change file, intentions dir, top of README).
- **Mixing session layouts.** `<date>-<name>/` pre-existed w/ top-level files → DO NOT dump new files alongside. Use subdir per "Subsequent sessions" rule. Mixed layouts break chronological reading.
- **One giant transcript file.** Tried once. Unreadable. Always per-turn. (Per-turn does NOT mean per-turn-summary — means per-turn-FULL-CONTENT.)
- **Forgetting references.md.** Explored 4 turns, read 15 files, forgot to document 3. references.md MUST be built incrementally, not retroactively.
- **Dir listing without blocker analysis = reader doesn't know what to decide next (2026-07-20 incident).** Persisted findings had 26 open threads, dir listing showed stats but reader had no prioritization. User asked: "ANY threads that might completely blocked the current implementation and must be decided? If DEFERRED, could we implement anyway?" FIX: ADD Step 10 — Section (a) blocker analysis (true blockers only, severity-sorted, 3-5 lines each, with suggested approach) + Section (b) deferral feasibility (per-blocker YES/NO + what's lost + global verdict). Reader walks away knowing: what MUST be decided NOW, AND whether ship-with-deferred is real or cope.

## When to STOP and ASK

- **Cannot derive `<name>`.** Ask user.
- **Explore still ongoing** (user hasn't said "document this"). DO NOT preemptively write findings mid-explore. Wait for explicit instruction.
- **User instruction contradicts playbook.** User's words win. Ask if unclear.
- **Conversation huge (>30 turns).** Ask whether to document ALL turns or only load-bearing ones (decisions, corrections, conclusions). BUT: once turns selected, each reproduced in FULL — selection of turns is only thing you ask about, never what to strip from selected turn.
- **Worker deliverable missing/empty.** DO NOT fabricate. Note gap in turn file + open-threads, ask user.
- **Ambiguous blocker classification.** Thread could be blocker OR next-step depending on interpretation → ASK user, do NOT guess. Default: NOT a blocker (lower false-positive cost).
- **Deferral verdict ambiguous.** Cannot tell if "ship with deferred" = real or cope → ASK user. Do NOT manufacture YES.

## Output checklist (run before declaring done)

- [ ] `<date>-<name>/README.md` exists, lists every topic with 3-5 line summary.
- [ ] One file per turn, date-prefixed. No merges. No skips.
- [ ] Every verbatim user word preserved (profanity/typos/CAPS included).
- [ ] Every assistant table / code block / command output / diagram reproduced AS-IS in turn file (cross-check against step-2 inventory — zero items dropped).
- [ ] `locked-decisions.yaml` exists IF any decision locked. Each entry has `id`, `turn`, `parts`, `user_quote` (verbatim), `decision`, `status`.
- [ ] `open-threads.yaml` exists IF explore ongoing or deferred items. Has top-level `status` + per-thread `status`.
- [ ] Every locked-decision `user_quote` VERBATIM (profanity/typos/CAPS preserved).
- [ ] Every locked-decision `turn` + `parts` point to real section in real turn file.
- [ ] NO legacy `*-locked-decisions-canonical.md` or `*-open-threads.md` remain. All migrated to `.yaml` + old `.md` deleted.
- [ ] Worker deliverables cross-referenced by full path AND load-bearing content reproduced verbatim (not summarized).
- [ ] Prior session files untouched.
- [ ] No new analysis, diagrams, or decisions introduced.
- [ ] `references.md` exists. Lists all sources consulted (files read, docs referenced, code patterns).
- [ ] Directory listing shows per-turn stats: Threads/decided/remain per turn + totals for cross-turn files.
- [ ] Directory listing shows appendix files with gotcha stats IF gotcha-coverage / step-20 ran (Gotchas count + rank5+ + rank4 per appendix).
- [ ] Section (a) BLOCKERS: true blockers only (deferrable threads excluded), severity-sorted, 3-5 lines each, suggested approach present. Explicit "No blockers" statement if none.
- [ ] Section (b) DEFERRAL: per-blocker YES/NO + what's lost. Global verdict present. Honest NO where deferral genuinely blocks.
- [ ] Fresh reader test: README + first turn + last turn + locked-decisions + references + dir listing + sections (a)+(b) = enough to resume AND see same tables/code live conversation produced AND know what blocks NOW AND whether ship-deferred is real.

INSTRUCTION>>>