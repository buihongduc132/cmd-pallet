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
  const { runCli } = await import("../src/cli.ts");
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
  process.exit(exitCode);
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
  const exitCode = res.status ?? 0;
  process.exitCode = exitCode;
  process.exit(exitCode);
}
