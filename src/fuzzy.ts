/**
 * cmd-pallet — fuzzy matching and multi-field ranking
 */

import type { ExternalCommand } from "./types.ts";

export interface FuzzyScoreOptions {
  boundaryBonus?: number;
  consecutiveBonus?: number;
  leadingBonus?: number;
}

export interface FuzzyField<T> {
  text: (item: T) => string;
  weight: number;
}

export interface FuzzyRankResult<T> {
  item: T;
  score: number;
}

const DEFAULTS = {
  boundaryBonus: 4,
  consecutiveBonus: 12,
  leadingBonus: 8,
};

const SEPARATORS = new Set(["/", "_", "-", ".", " ", ":", "@"]);

function isBoundaryAt(original: string, ci: number): boolean {
  if (ci === 0) return true;
  const prev = original[ci - 1];
  const curr = original[ci];
  if (SEPARATORS.has(prev)) return true;
  const prevIsLower = prev >= "a" && prev <= "z";
  const currIsUpper = curr >= "A" && curr <= "Z";
  return prevIsLower && currIsUpper;
}

export function fuzzyScore(
  query: string,
  candidate: string,
  opts?: FuzzyScoreOptions
): number {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const q = String(query || "").toLowerCase();
  const c = String(candidate || "").toLowerCase();
  if (!q) return 1;
  if (q.length > c.length) return 0;

  let score = 0;
  let qi = 0;
  let lastMatchIdx = -2;
  let matchedAny = false;

  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] !== q[qi]) continue;
    matchedAny = true;
    if (isBoundaryAt(candidate, ci)) score += o.boundaryBonus;
    if (ci === 0) score += o.leadingBonus;
    if (ci === lastMatchIdx + 1) score += o.consecutiveBonus;
    lastMatchIdx = ci;
    qi++;
  }

  if (!matchedAny || qi < q.length) return 0;
  return score;
}

export function fuzzyRankMulti<T>(
  query: string,
  items: T[],
  fields: FuzzyField<T>[],
  opts?: FuzzyScoreOptions
): FuzzyRankResult<T>[] {
  const scored = items.map((item) => {
    let best = 0;
    for (const field of fields) {
      const raw = fuzzyScore(query, field.text(item), opts);
      const weighted = raw * field.weight;
      if (weighted > best) best = weighted;
    }
    return { item, score: best };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

export function searchCommands(
  commands: ExternalCommand[],
  query: string
): ExternalCommand[] {
  const q = String(query || "").trim();
  if (!q) return commands;
  const fields: FuzzyField<ExternalCommand>[] = [
    { text: (c) => c.name || "", weight: 3 },
    { text: (c) => c.description || "", weight: 2 },
    { text: (c) => c.content || "", weight: 1 },
  ];
  return fuzzyRankMulti(q, commands, fields).map((s) => s.item);
}
