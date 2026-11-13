/**
 * cmd-pallet — usage stats (read-only)
 *
 * Aggregates every host's usage files in one dir (see src/usage.ts for shapes):
 *   <host>.json      → actions per date-hour  → "by machine", "by time"
 *   <host>.cmds.json → cmds per action/hour   → "top commands"
 * Never writes. Unreadable / malformed files are skipped with one warning each.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface StatsOptions {
  /** Row limit for top commands and date-hour rows. */
  top: number;
  /** Only count this host. */
  host?: string;
  warn?: (msg: string) => void;
}

export interface UsageStats {
  topCommands: { cmd: string; total: number; byHost: Record<string, number> }[];
  byHost: { host: string; total: number; topAction: string; topActionCount: number }[];
  byDateHour: { dateHour: string; total: number }[];
  byHourOfDay: { hour: string; total: number }[];
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Calls fn(path, count) for every numeric leaf at exactly `depth` levels below `node`. */
function leaves(node: unknown, depth: number, fn: (path: string[], n: number) => void, path: string[] = []): void {
  if (depth === 0) {
    if (typeof node === "number" && Number.isFinite(node)) fn(path, node);
    return;
  }
  if (!isObj(node)) return;
  for (const key of Object.keys(node)) leaves(node[key], depth - 1, fn, [...path, key]);
}

function add(map: Map<string, number>, key: string, n: number): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

function byCountDesc<T>(count: (x: T) => number, name: (x: T) => string) {
  return (a: T, b: T) => count(b) - count(a) || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0);
}

function readUsageFiles(dir: string, warn: (msg: string) => void): { actions: Obj[]; cmds: Obj[] } {
  const actions: Obj[] = [];
  const cmds: Obj[] = [];
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return { actions, cmds };
  }
  for (const name of names) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      data = undefined;
    }
    if (!isObj(data)) {
      warn(`[warn] skipped unreadable usage file: ${name}\n`);
      continue;
    }
    (name.endsWith(".cmds.json") ? cmds : actions).push(data);
  }
  return { actions, cmds };
}

/** Aggregate usage in `dir` (missing dir → empty stats). */
export function computeStats(dir: string, opts: StatsOptions): UsageStats {
  const warn = opts.warn ?? (() => {});
  const keep = (host: string) => opts.host === undefined || host === opts.host;
  const { actions, cmds } = readUsageFiles(dir, warn);

  // cmd → host → n
  const cmdHost = new Map<string, Map<string, number>>();
  for (const file of cmds) {
    leaves(file, 4, ([host, cmd], n) => {
      if (!keep(host)) return;
      if (!cmdHost.has(cmd)) cmdHost.set(cmd, new Map());
      add(cmdHost.get(cmd)!, host, n);
    });
  }

  const hostAction = new Map<string, Map<string, number>>();
  const dateHour = new Map<string, number>();
  const hourOfDay = new Map<string, number>();
  for (const file of actions) {
    leaves(file, 3, ([host, action, dh], n) => {
      if (!keep(host)) return;
      if (!hostAction.has(host)) hostAction.set(host, new Map());
      add(hostAction.get(host)!, action, n);
      add(dateHour, dh, n);
      add(hourOfDay, dh.slice(11, 13), n);
    });
  }

  const topCommands = [...cmdHost]
    .map(([cmd, hosts]) => {
      const byHost: Record<string, number> = {};
      for (const h of [...hosts.keys()].sort()) byHost[h] = hosts.get(h)!;
      return { cmd, total: [...hosts.values()].reduce((a, b) => a + b, 0), byHost };
    })
    .sort(byCountDesc((r) => r.total, (r) => r.cmd))
    .slice(0, opts.top);

  const byHost = [...hostAction]
    .map(([host, acts]) => {
      const [topAction, topActionCount] = [...acts].sort(byCountDesc(([, n]) => n, ([a]) => a))[0];
      return { host, total: [...acts.values()].reduce((a, b) => a + b, 0), topAction, topActionCount };
    })
    .sort(byCountDesc((r) => r.total, (r) => r.host));

  const byDateHour = [...dateHour]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, opts.top)
    .map(([dh, total]) => ({ dateHour: dh, total }));

  const byHourOfDay = [...hourOfDay]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hour, total]) => ({ hour, total }));

  return { topCommands, byHost, byDateHour, byHourOfDay };
}

export function isEmptyStats(s: UsageStats): boolean {
  return s.byHost.length === 0 && s.topCommands.length === 0;
}

function table(rows: string[][]): string[] {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  // numeric columns (all digits below the header) right-aligned
  const numeric = widths.map((_, i) => rows.slice(1).every((r) => /^\d+$/.test(r[i])));
  return rows.map((r) =>
    "  " + r.map((c, i) => (i === r.length - 1 ? c : numeric[i] ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ").trimEnd(),
  );
}

/** Human-readable stats; caller handles the empty case. */
export function formatStats(s: UsageStats, top: number): string {
  const lines: string[] = [];
  lines.push(`Top commands (top ${top})`);
  if (s.topCommands.length === 0) lines.push("  (none — only read/get/run record a command)");
  else
    lines.push(
      ...table([
        ["cmd", "total", "per host"],
        ...s.topCommands.map((r) => [
          r.cmd,
          String(r.total),
          Object.entries(r.byHost)
            .map(([h, n]) => `${h}=${n}`)
            .join(" "),
        ]),
      ]),
    );
  lines.push("", "By machine");
  lines.push(
    ...table([
      ["host", "total", "top action"],
      ...s.byHost.map((r) => [r.host, String(r.total), `${r.topAction} (${r.topActionCount})`]),
    ]),
  );
  lines.push("", `By time (UTC date-hour, most recent ${top})`);
  lines.push(...table([["date-hour", "total"], ...s.byDateHour.map((r) => [r.dateHour, String(r.total)])]));
  lines.push("", "Hour of day (UTC)");
  lines.push(...table([["hour", "total"], ...s.byHourOfDay.map((r) => [r.hour, String(r.total)])]));
  return lines.join("\n");
}
