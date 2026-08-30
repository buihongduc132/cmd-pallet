import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const FIXTURE_ROOT = resolve(__dirname, "fixtures");
export const FIXTURE_CATALOG_DIR = resolve(FIXTURE_ROOT, "catalog");
export const FIXTURE_CONFIG_PATH = resolve(FIXTURE_ROOT, "unify-cmd.json");

export interface MockIo {
  stdout: { write: (s: string) => void; toString: () => string; clear: () => void };
  stderr: { write: (s: string) => void; toString: () => string; clear: () => void };
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export function createMockIo(overrides?: { cwd?: string; env?: Record<string, string | undefined> }): MockIo {
  let stdoutData = "";
  let stderrData = "";

  return {
    stdout: {
      write: (s: string) => {
        stdoutData += s;
      },
      toString: () => stdoutData,
      clear: () => {
        stdoutData = "";
      },
    },
    stderr: {
      write: (s: string) => {
        stderrData += s;
      },
      toString: () => stderrData,
      clear: () => {
        stderrData = "";
      },
    },
    cwd: overrides?.cwd ?? FIXTURE_ROOT,
    env: {
      PI_CODING_AGENT_DIR: FIXTURE_ROOT,
      CMD_PALLET_CACHE_TTL: "0",
      ...overrides?.env,
    },
  };
}

export function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "cmd-pallet-test-"));
  try {
    return Promise.resolve(fn(dir)).finally(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}
