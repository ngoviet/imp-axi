import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommandArgs } from "../args.js";
import { findEngine, skillDir, skillEngineVersion } from "../engine.js";
import type { Runtime } from "../runtime.js";

export const HOME_HELP = `usage: impeccable-axi home
description: Engine and skill status plus the current project's design context files. Same as running with no arguments
`;

function tilde(p: string, home: string): string {
  return p.toLowerCase().startsWith(home.toLowerCase()) ? `~${p.slice(home.length).replace(/\\/g, "/")}` : p;
}

export function homeHeader(description: string, rt: Runtime): Record<string, unknown> {
  return { bin: tilde(process.argv[1] ?? "", rt.home), description };
}

export async function homeView(args: string[], rt: Runtime): Promise<Record<string, unknown>> {
  parseCommandArgs("home", args);
  const dir = skillDir(rt);
  const skillMd = join(dir, "SKILL.md");
  const engine = findEngine(rt);
  let engineState = "missing: install the Impeccable skill or set IMPECCABLE_BIN";
  if (engine?.via === "launcher") {
    engineState = `not downloaded yet: the skill launcher fetches engine ${skillEngineVersion(rt) ?? "?"} on first scan`;
  } else if (engine) {
    // engine-probe: bắt tay rẻ (in "impeccable-engine <version>"), không quét gì.
    const r = await rt.run(engine.path, ["engine-probe"], 15_000);
    const v = r.code === 0 ? r.stdout.match(/impeccable-engine\s+(\S+)/)?.[1] : undefined;
    engineState = `${v ?? "unknown version"} (${engine.via}: ${tilde(engine.path, rt.home)})`;
  }

  let skillState = "missing";
  if (existsSync(skillMd)) {
    const text = readFileSync(skillMd, "utf8");
    const version = text.match(/^version:\s*(\S+)/m)?.[1] ?? "?";
    const patched = text.includes("impeccable-axi:begin");
    skillState = `${version} at ${tilde(dir, rt.home)}, ${patched ? "patched (detect goes through impeccable-axi)" : "not patched"}`;
  }

  const ctx = ["PRODUCT.md", "DESIGN.md", ".impeccable/config.json"].map((f) => `${f} ${existsSync(join(rt.cwd, f)) ? "yes" : "no"}`);
  const help = [
    "Run `impeccable-axi detect <dir|file|url>` to scan (built .html or a dev-server URL runs every rule)",
  ];
  if (skillState.endsWith("not patched")) help.push("Run `impeccable-axi patch-skill` so the Impeccable skill uses impeccable-axi for detect");
  if (!existsSync(join(rt.cwd, "PRODUCT.md"))) help.push("Run `/impeccable init` in Claude Code to write PRODUCT.md / DESIGN.md for this project");
  return {
    engine: engineState,
    skill: skillState,
    project: `${rt.cwd}: ${ctx.join(", ")}`,
    help,
  };
}
