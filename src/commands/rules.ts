import { type FlagSpec, listFlag, parseCommandArgs } from "../args.js";
import { prepareEngine, skillEngineVersion } from "../engine.js";
import { fail } from "../errors.js";
import type { Runtime } from "../runtime.js";
import { assertFields, clip, type Row, tally } from "../views.js";

export const RULES_HELP = `usage: imp-axi rules [id...] [flags]
description: The detector's rule catalog (detect --list-rules --json) without scanning: id, category, severity, scopes and what each rule flags. Name rule ids to read their full description
flags[7]:
  --category <c,c>: only these categories (see the categories line)
  --grep <text>: only rules whose id, name or description contains this text
  --fields a,b: columns (default id,category,severity,description; also name,scopes,advisory)
  --scope <type,layout>: engine: only rules in these design domains
  --no-advisory: engine: drop advisory rules
  --full: untruncated descriptions
  --help: this help
notes[2]:
  Needs engine 0.1.17 or later (the skill's scripts/VERSION pins it)
  Lists every registered rule, including ones a project switched off with ignoreRules
examples[3]:
  imp-axi rules
  imp-axi rules low-contrast side-tab
  imp-axi rules --grep shadow
`;

const FLAGS: Record<string, FlagSpec> = {
  category: { type: "string", hint: "--category <c,c>" },
  grep: { type: "string", hint: "--grep <text>" },
  scope: { type: "string", hint: "--scope <type,layout>" },
  "no-advisory": { type: "boolean", hint: "--no-advisory" },
};

const DEFAULT_FIELDS = ["id", "category", "severity", "description"] as const;
const AVAILABLE_FIELDS = ["id", "name", "category", "severity", "scopes", "description", "advisory"] as const;
const DESC_LIMIT = 140;

/** Một dòng của `detect --list-rules --json` (engine ≥ 0.1.17). */
export interface Rule {
  id: string;
  name?: string;
  category?: string;
  severity?: string;
  scopes?: string[];
  description?: string;
  advisory?: boolean;
}

export async function rulesCommand(args: string[], rt: Runtime): Promise<Record<string, unknown>> {
  const p = parseCommandArgs("rules", args, FLAGS, { min: 0, max: Infinity });
  const fields = p.global.fields ?? [...DEFAULT_FIELDS];
  assertFields(fields, AVAILABLE_FIELDS);
  const ids = p.positionals;
  const categories = listFlag(p, "category");
  const grep = p.str("grep")?.toLowerCase();

  const engine = await prepareEngine(rt);
  const engineArgs = ["detect", "--list-rules", "--json"];
  const scope = p.str("scope");
  if (scope !== undefined) engineArgs.push("--scope", scope);
  if (p.bool("no-advisory")) engineArgs.push("--no-advisory");

  const res = await rt.run(engine.path, engineArgs);
  if (res.code === 124 || res.code === 127) {
    fail(`Impeccable engine did not ${res.code === 124 ? "finish" : "start"} (${engine.via}: ${engine.path})`, res.code === 127 ? "ENGINE_MISSING" : "SCAN_FAILED", [
      clip(res.stderr.trim().split(/\r?\n/).pop() ?? "", 300),
    ].filter(Boolean));
  }
  const all = parseRules(res.stdout);
  if (!all) {
    const pinned = skillEngineVersion(rt);
    fail(`rules: the engine did not return a rule catalog (exit ${res.code})`, "SCAN_FAILED", [
      clip(res.stderr.trim() || res.stdout.trim() || "no output", 300),
      `--list-rules needs engine 0.1.17 or later${pinned ? `; the skill pins ${pinned}` : ""}: update the Impeccable skill (npx impeccable update), run \`imp-axi patch-skill\` again, then rerun`,
    ]);
  }

  const unknown = ids.filter((id) => !all.some((r) => r.id === id));
  const shown = all
    .filter((r) => !ids.length || ids.includes(r.id))
    .filter((r) => !categories || categories.includes(r.category ?? ""))
    .filter((r) => !grep || [r.id, r.name, r.description].some((s) => s?.toLowerCase().includes(grep)));

  const advisory = all.filter(isAdvisory).length;
  const out: Record<string, unknown> = {
    status: `${all.length} rules (${all.length - advisory} primary, ${advisory} advisory)`,
    categories: tally(all, (r) => r.category ?? "").map(([c, n]) => `${c} ${n}`).join(", "),
  };
  const filters = [
    ids.length && `id=${ids.join(",")}`,
    categories && `category=${categories.join(",")}`,
    grep && `grep~${p.str("grep")}`,
  ].filter(Boolean);
  if (filters.length) out["filter"] = `${filters.join(" ")}: ${shown.length} of ${all.length}`;
  if (unknown.length) out["attention"] = `unknown rule ids: ${unknown.join(", ")}`;

  // Nêu id cụ thể ⇒ người hỏi muốn đọc mô tả: in đủ.
  const full = p.global.full || ids.length > 0;
  const help: string[] = [];
  if (shown.length) {
    const limit = full ? Infinity : (p.global.limit ?? Infinity);
    const rows = shown.slice(0, limit).map((r) => toRow(r, fields, full));
    out["count"] = rows.length < shown.length ? `${rows.length} of ${shown.length} total` : shown.length;
    out["rules"] = rows;
    if (!full) help.push(`Run \`imp-axi rules ${shown[0]!.id}\` for one rule's full description`);
    help.push("Run `imp-axi detect <dir|url> --rule <id>` to scan for one rule");
  } else {
    out["rules"] = "0 rules found";
    if (unknown.length) help.push("Run `imp-axi rules` to list every rule id");
    else if (filters.length) help.push(`Categories present: ${tally(all, (r) => r.category ?? "").map(([c]) => c).join(", ")}`);
  }
  return { ...out, help };
}

const isAdvisory = (r: Rule): boolean => r.advisory === true || r.severity === "advisory";

/** stdout của engine ⇒ danh mục luật; undefined nếu không phải mảng JSON các luật (vd engine cũ quét thay vì liệt kê). */
export function parseRules(stdout: string): Rule[] | undefined {
  const text = stdout.trim();
  if (!text) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(data)) return undefined;
  const rules = data.filter((r): r is Rule => typeof r === "object" && r !== null && typeof (r as Rule).id === "string");
  // Engine 0.1.16 không biết --list-rules: mảng rỗng hoặc mảng phát hiện (có `antipattern`, không có `id`).
  return rules.length ? rules : undefined;
}

function toRow(r: Rule, fields: readonly string[], full: boolean): Row {
  const desc = r.description ?? "";
  const all: Row = {
    id: r.id,
    name: r.name ?? "",
    category: r.category ?? "",
    severity: r.severity ?? "",
    scopes: (r.scopes ?? []).join(" "),
    description: full ? desc : clip(desc, DESC_LIMIT),
    advisory: isAdvisory(r),
  };
  return Object.fromEntries(fields.map((k) => [k, all[k] ?? ""]));
}
