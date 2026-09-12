this is user requirement : t
This is previous context : <none — first hop>

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
         note: |                 # optional — context/