this is user requirement : t
This is previous context : <none — first hop>

# /gotcha-coverage (loaded dynamically from cmd-pallet)
# gotcha-coverage
argument-hint: [<findings-dir-or-plan-path>]

$ARGUMENTS

---

→ Chain: findings `cmd-family/findings.yml` step 20 · plan `cmd-family/plan.yml` step 20

## (A) Intention

**gotcha coverage + resolve open threads.** Structure-agnostic. ONE cmd, both families.

Handles BOTH:
- **Findings dir** (`open-threads.yaml` + turn files + `locked-decisions.yaml`)
- **Plan file** (`flow/plans/<slug>.md` w/ `## Declarative Items` + DOD)

**Why prior cmds failed:** structure-coupled. Findings cmd sought `open-threads.yaml` only → blind to plans. Plan cmd sought `## Declarative Items` only → blind to findings. Two parallel cmds = drift.

**Fix:** ONE cmd. Detect structure → normalize to **review units** → delegate → write structure-appropriate appendix. Default target = previous message context (last findings OR plan discussed) OR `$1` path.

**Families:** referenced by BOTH `findings.yml` (step 20) AND `plan.yml` (step 20). Interchangeable — same ACTION regardless of source structure.

---

## Pre-flight — RESOLVE target (default = previous context)

1. **RESOLVE target.** Priority:
   a. `$1` given (findings dir OR plan file path) → use it.
   b. NO `$1` → scan PREVIOUS message context for last findings dir OR plan file referenced.
   c. Neither → STOP + ASK "which findings dir or plan path?".
2. **DETECT structure.**
   - Dir + `open-threads.yaml` → **FINDINGS mode**.
   - `.md` + `## Declarative Items` → **PLAN mode**.
   - Else → STOP + ASK (unknown structure).
3. **READ structure.**
   - FINDINGS: `README.md`, `open-threads.yaml`, `locked-decisions.yaml`, turn files, `references.md`.
   - PLAN: plan file (Requirement, DOD, Declarative Items w/ IDs + Status + Probe).

## Extract review units

Normalize BOTH → common **review units**:

| Source | Unit |
|--------|------|
| FINDINGS open thread (OT#) | unit |
| FINDINGS locked decision (LD#) | unit (decisions have blind spots) |
| FINDINGS turn conclusion / assumption | unit |
| PLAN declarative item (`(slug-id)`) | unit |
| PLAN DOD criterion | unit |
| PLAN edge case already listed | CONTEXT (skip; avoid dup) |

Group batches ≤5 by topic affinity.

## Delegate (MANDATORY — teams / subagent / ACP)

EACH batch:
- Spawn 1 sub-agent.
- Prompt = 5 units (FULL TEXT, not refs) + instruction + constraints.
- Instruction: "Find gotchas, edge cases, failure modes, unconsidered scenarios, invalid assumptions. Each: describe, severity, mitigation."
- Constraint: "DO NOT re-analyze. ONLY find what MISSED."
- Constraint: "Global scope. NO project assumptions."

ALL batches PARALLEL. Collect outputs.

## Rank (YAGNI → sophisticated)

```
Rank 1 (YAGNI):         theoretical, unlikely, low impact.
Rank 2 (Minor):         possible, trivial / handled mitigation.
Rank 3 (Moderate):      plausible, needs explicit handling/docs.
Rank 4 (Significant):   likely, impacts correctness if unaddressed.
Rank 5 (Sophisticated): fundamental gap — invalidates / limits source.
```

Rank 3+ first (actionable).

## Classify — separate vs appendix

EACH gotcha:
- **<30% overlap** w/ any unit → SEPARATE topic (new file/subdir).
- **Extends unit** → APPENDIX to source.

## Write output (structure-aware)

### FINDINGS mode
- Appendix: `<date>-turn<N><letter>-gotcha-<slug>.md` (turn RETAINED; letter a,b,c).
- Original turn files IMMUTABLE.
- `open-threads.yaml`: rank 3+ → new OT (`source: gotcha-coverage`).
- `locked-decisions.yaml`: gotcha INVALIDATES LD → new auto LD supersedes (`auto_decided: true`, `supersedes: LD<x>`); VALIDATES LD → appendix note ONLY.

### PLAN mode
- Sibling: `<slug>-gotcha.md` (same dir).
- OR append `## Gotcha Coverage` to plan (append-only — NO rewriting items).
- New items → APPEND `## Declarative Items` w/ stable `(slug-id)` + `Status: pending` + `Probe:`.
- Gotcha invalidates item → mark `Status: blocked` + row in `## Open Threads`.
- Gotcha validates item → gotcha doc note ONLY.

## Appendix doc shape

```markdown
# Gotcha Coverage — <source>

> Source: <path>
> Mode: <findings|plan>
> Sub-agent: <name>
> Units reviewed: OT1, (slug-a), ...

## Findings (ranked)

### Rank 5 (Sophisticated)
- **<title>**
  - What: <desc>
  - Why missed: <why source missed>
  - Severity: <impact>
  - Mitigation: <approach>

### Rank 4 / 3 / 2 / 1
...

## Cross-references
- Also relevant: <other unit>
```

## MUST follow

- **Detect structure.** NOT assume findings. NOT assume plan.
- **Delegate.** NEVER self-review. Orchestrate + write.
- **≤5 units / sub-agent.**
- **Originals IMMUTABLE.** Appendix only. Even to "fix".
- **Retain IDs / turn numbers.** `turn3a` belongs `turn3`. Plan `(slug-id)` stable forever.
- **Rank EVERY gotcha.**
- **Update cross-unit files.** Rank 3+ → YAML (findings) / `## Open Threads` (plan).
- **Append-only re-run.** Status flips only. NEVER rewrite prose.
- **Global scope.** NO project assumptions.

## MUST AVOID

- **DO NOT assume findings structure.** Plan valid.
- **DO NOT re-analyze topic.** Find MISSED, not found.
- **DO NOT modify originals.** Even to "fix". Appendix.
- **DO NOT skip ranking.**
- **DO NOT auto-supersede user-locked decisions.** Surface + STOP + ASK. Auto-decided LDs only.
- **DO NOT merge all gotchas 1 file** if multi-batch → per-batch appendix (traceability).
- **DO NOT re-derive plan IDs re-run.** Stable = identity.
- **DO NOT re-review listed plan edge cases.** Cross-check → skip dup → context.

## STOP + ASK when

- Target empty / unknown structure.
- Sub-agent empty (verify read; if yes → "no gotchas" note, still write).
- Gotcha invalidates USER-locked decision → ASK. NOT auto-supersede.
- FINDINGS zero threads+decisions OR PLAN zero items → nothing to review. STOP.

## Tips / tricks

- **Batch by affinity.** Shared domain → deeper than random.
- **Parallel delegate.** All independent → spawn together.
- **Unit TEXT in prompt.** Sub-agent no re-read (context efficiency).
- **Rank 5 = alarm.** Highlight. May invalidate whole source.
- **Plan mode: dedup.** Cross-check vs listed edge cases. Feed as CONTEXT, "find BEYOND these".
- **Re-run cheap.** Re-probe seconds. Run often.
- **Cross-ref gotchas.** Batch-1 X relates batch-3 Y → note both.

## Mistakes / lessons learned

1. **Structure-coupling bug:** prior findings-gotcha hard-rejected plans (pre-flight `open-threads.yaml` only). FIX: detect structure → normalize review units.
2. **Re-analysis trap:** sub-agents re-explore vs find gaps. FIX: "ONLY find what MISSED".
3. **Unranked gotchas:** no priority. FIX: rank mandatory.
4. **User-locked auto-supersede:** silent override. FIX: surface open thread, ASK.
5. **Plan ID regeneration:** re-run regen `(slug-id)` breaks trace. FIX: append-only, stable.
6. **Batch overload:** >5 units → shallow. FIX: cap 5.
7. **Plan edge-case dup:** plan has 25 cases → gotcha rediscovers same = noise. FIX: feed as CONTEXT, "find BEYOND".

## Useful references

- Declarative plan: end-state items + stable IDs + probe-verifiable + append-only reconcile.
- Findings struct: turn files + `open-threads.yaml` + `locked-decisions.yaml` + `README.md`.
- Sub-agent delegation: teams / ACP / pi-subagents (parallel).
- Family manifests: `~/.pi/agent/cmd-family/<family>.yml` (if cmd binds family).

## GOAL (declarative DOD)

Unified gotcha: ONE cmd findings AND plan. Detect → normalize → delegate → rank → structure-appropriate appendix → update cross-unit. No structure-coupling. No re-analysis. Every gotcha ranked. Originals immutable. Append-only re-run.
