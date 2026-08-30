/**
 * cmd-pallet — catalog loader and command discovery
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import type {
  CatalogOptions,
  CatalogResult,
  ExternalCommand,
  FindResult,
} from "./types.ts";
import { formatRead } from "./format.ts";

export { formatRead };

const require = createRequire(import.meta.url);

let piModuleCache: {
  loadConfig?: (cwd?: string) => any;
  discoverCommands?: (config: any, cwd: string) => ExternalCommand[];
} | null = null;

async function getPiDiscovery() {
  if (piModuleCache) return piModuleCache;

  const ts = require("typescript");
  const moduleRegistry: Record<string, { mod: any; url: string }> = {};

  async function loadPiModule(relPath: string): Promise<any> {
    const filePath = require.resolve("pi-unify-cmd/" + relPath);
    if (moduleRegistry[filePath]) return moduleRegistry[filePath].mod;

    const code = readFileSync(filePath, "utf-8");
    let transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const matches = [...transpiled.matchAll(/from\s+["'](\.[^"']+)["']/g)];
    for (const match of matches) {
      const rel = match[1];
      let depPath = resolve(dirname(filePath), rel);
      if (!depPath.endsWith(".ts")) depPath += ".ts";
      const depRel = "extensions/" + depPath.split("/extensions/")[1];
      await loadPiModule(depRel);
    }

    for (const match of matches) {
      const rel = match[1];
      let depPath = resolve(dirname(filePath), rel);
      if (!depPath.endsWith(".ts")) depPath += ".ts";
      const depRel = "extensions/" + depPath.split("/extensions/")[1];
      const depUrl = moduleRegistry[require.resolve("pi-unify-cmd/" + depRel)].url;
      transpiled = transpiled.replaceAll(match[0], `from "${depUrl}"`);
    }

    const dataUrl =
      "data:text/javascript;base64," +
      Buffer.from(transpiled).toString("base64");
    const mod = await import(dataUrl);
    moduleRegistry[filePath] = { mod, url: dataUrl };
    return mod;
  }

  const configMod = await loadPiModule("extensions/config.ts");
  const discoveryMod = await loadPiModule("extensions/discovery.ts");

  piModuleCache = {
    loadConfig: configMod.loadConfig,
    discoverCommands: discoveryMod.discoverCommands,
  };
  return piModuleCache;
}

export function grokCommandName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function slashMarkdown(cmd: ExternalCommand): string {
  const name = grokCommandName(cmd.name);
  const desc = cmd.description || `cli-agent-cmd ${cmd.name}`;
  const hint = cmd.argumentHint || cmd.argument_hint || "";
  const hintLine = hint ? `argument-hint: ${JSON.stringify(hint)}\n` : "";
  return `---\nname: ${name}\ndescription: ${JSON.stringify(desc)}\n${hintLine}user-invocable: true\n---\n\n${cmd.content}\n`;
}

export function findCommand(
  commands: ExternalCommand[],
  name: string
): FindResult {
  const raw = String(name || "").replace(/^\//, "").trim();
  if (!raw) return {};

  const lower = raw.toLowerCase();
  const dashed = grokCommandName(raw);
  const rawUnderToDash = raw.replace(/__/g, "-").toLowerCase();

  const matches = commands.filter((c) => {
    const n = String(c.name || "");
    const nLower = n.toLowerCase();
    const nDashed = grokCommandName(n);
    const nUnderToDash = n.replace(/__/g, "-").toLowerCase();

    return (
      n === raw ||
      nLower === lower ||
      nDashed === dashed ||
      nUnderToDash === rawUnderToDash ||
      nUnderToDash === lower ||
      nLower === rawUnderToDash
    );
  });

  if (matches.length > 1) {
    return {
      ambiguous: true,
      candidates: matches,
    };
  }
  if (matches.length === 1) {
    return {
      command: matches[0],
    };
  }
  return {};
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = out[key];
    if (
      tv &&
      sv &&
      typeof tv === "object" &&
      typeof sv === "object" &&
      !Array.isArray(tv) &&
      !Array.isArray(sv)
    ) {
      out[key] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>
      );
    } else {
      out[key] = sv;
    }
  }
  return out;
}

export function discoverCommands(
  config: unknown,
  cwd: string
): ExternalCommand[] {
  throw new Error("Use loadCatalog for command discovery");
}

export async function loadCatalog(
  cwd?: string,
  options?: CatalogOptions
): Promise<CatalogResult> {
  const pi = await getPiDiscovery();

  const agentBaseDir = options?.agentDir ?? process.env.PI_CODING_AGENT_DIR;

  let globalConfigPath: string;
  let resolvedConfigPath: string;

  if (agentBaseDir) {
    if (!existsSync(agentBaseDir)) {
      throw new Error(`Config error: agent directory does not exist: ${agentBaseDir}`);
    }

    const candidates = [
      join(agentBaseDir, "agent", "unify-cmd.json"),
      join(agentBaseDir, "unify-cmd.json"),
      join(agentBaseDir, ".unify-cmd.json"),
    ];

    const found = candidates.find((p) => existsSync(p));
    globalConfigPath = found || join(agentBaseDir, "agent", "unify-cmd.json");
    resolvedConfigPath = globalConfigPath;
  } else {
    globalConfigPath = join(homedir(), ".pi", "agent", "unify-cmd.json");
    resolvedConfigPath = globalConfigPath;
  }

  const effectiveCwd = cwd || process.cwd();
  const projectCandidates = [
    join(effectiveCwd, ".unify-cmd.json"),
    join(effectiveCwd, "unify-cmd.json"),
  ];
  const projectPath = projectCandidates.find(
    (p) => existsSync(p) && p !== globalConfigPath
  );

  let rawConfig: any = {
    agents: {
      claude: {
        enabled: true,
        globalDir: "~/.claude/commands",
        projectDir: ".claude/commands",
        recursive: true,
      },
      opencode: {
        enabled: true,
        mirrorToPrompts: true,
        globalDirs: [
          "~/.config/opencode/commands",
          "~/.config/opencode/command",
          "~/.config/opencode/profiles/default/commands",
        ],
        projectDirs: [".opencode/commands", ".opencode/command"],
        recursive: true,
      },
      codex: {
        enabled: true,
        globalDir: "~/.codex/prompts",
        projectDir: null,
        recursive: true,
      },
      gemini: {
        enabled: true,
        globalDir: "~/.gemini/commands",
        projectDir: null,
        recursive: true,
      },
    },
    custom: [],
    labelFormat: "[{scope}] ({agent}) | {description}",
    prefixFormat: "{agent}:{name}",
  };

  if (existsSync(globalConfigPath)) {
    try {
      const content = readFileSync(globalConfigPath, "utf-8");
      rawConfig = deepMerge(rawConfig, JSON.parse(content));
      resolvedConfigPath = globalConfigPath;
    } catch {
      // malformed config
    }
  }

  if (projectPath && existsSync(projectPath)) {
    try {
      const content = readFileSync(projectPath, "utf-8");
      rawConfig = deepMerge(rawConfig, JSON.parse(content));
      if (!existsSync(globalConfigPath)) {
        resolvedConfigPath = projectPath;
      }
    } catch {
      // malformed project config
    }
  }

  // Clean up and resolve paths with multi-stage isolation
  if (rawConfig.agents && typeof rawConfig.agents === "object") {
    for (const [agentName, agentCfg] of Object.entries(rawConfig.agents) as [string, any][]) {
      if (!agentCfg || typeof agentCfg !== "object") continue;

      // If globalDir was explicitly set to null/empty in config, clear globalDirs as well
      if (agentCfg.globalDir === null || agentCfg.globalDir === "") {
        agentCfg.globalDirs = [];
      }

      // If agentBaseDir is set, redirect '~' in global paths to agentBaseDir
      if (agentBaseDir) {
        if (typeof agentCfg.globalDir === "string" && agentCfg.globalDir.startsWith("~")) {
          agentCfg.globalDir = join(agentBaseDir, agentCfg.globalDir.slice(1));
        }
        if (Array.isArray(agentCfg.globalDirs)) {
          agentCfg.globalDirs = agentCfg.globalDirs.map((d: string) =>
            d.startsWith("~") ? join(agentBaseDir, d.slice(1)) : d
          );
        }
      }

      // Normalize projectDir paths
      if (
        agentCfg.projectDir &&
        !existsSync(join(effectiveCwd, agentCfg.projectDir))
      ) {
        const stripped = agentCfg.projectDir.replace(
          /^tests\/fixtures\/?/,
          ""
        );
        if (existsSync(join(effectiveCwd, stripped))) {
          agentCfg.projectDir = stripped;
        }
      }
    }
  }

  const commands = pi.discoverCommands!(rawConfig, effectiveCwd);

  return {
    commands,
    configPath: resolvedConfigPath,
    count: commands.length,
  };
}
