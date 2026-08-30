#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliTs = resolve(__dirname, "../src/cli.ts");

const hasStripTypes =
  process.execArgv.some((arg) => arg.includes("strip-types")) ||
  (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes("strip-types"));

if (hasStripTypes) {
  await import("../src/cli.ts");
} else {
  const nodeOptions = `${process.env.NODE_OPTIONS || ""} --experimental-strip-types --no-warnings=ExperimentalWarning`.trim();
  const env = { ...process.env, NODE_OPTIONS: nodeOptions };
  const res = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", cliTs, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env,
    }
  );
  process.exit(res.status ?? 0);
}
