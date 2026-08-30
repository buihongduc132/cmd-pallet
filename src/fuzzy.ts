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

export function fuzzyScore(
  query: string,
  candidate: string,
  opts?: FuzzyScoreOptions
): number {
  throw new Error("not implemented: fuzzyScore");
}

export function fuzzyRankMulti<T>(
  query: string,
  items: T[],
  fields: FuzzyField<T>[],
  opts?: FuzzyScoreOptions
): FuzzyRankResult<T>[] {
  throw new Error("not implemented: fuzzyRankMulti");
}

export function searchCommands(
  commands: ExternalCommand[],
  query: string
): ExternalCommand[] {
  throw new Error("not implemented: searchCommands");
}
