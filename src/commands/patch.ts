import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseCommandArgs } from "../args.js";
import { skillDir } from "../engine.js";
import { fail } from "../errors.js";
import type { Runtime } from "../runtime.js";

export const PATCH_HELP = `usage: impeccable-axi patch-skill [--revert] [--dry-run] [--skill-dir <path>]
description: Point the Impeccable skill's \`detect --json\` calls at \`impeccable-axi detect\` and add a short note to its SKILL.md. Idempotent; originals are kept in <skill>/.impeccable-axi-backup/ for --revert
flags[4]:
  --revert: restore the backed-up originals and remove the backup
  --dry-run: report what would change, write nothing
  --skill-dir <path>: skill folder (default IMPECCABLE_SKILL_DIR or ~/.claude/skills/impeccable)
  --help: this help
notes[2]:
  Run again after updating the skill (copying a new upstream version over it): already patched files are skipped
  Only JSON-mode detect calls are rewritten; text-mode \`detect <path>\` examples stay as they are
`;

export const BACKUP_DIR = ".impeccable-axi-backup";
const MARK_BEGIN = "<!-- impeccable-axi:begin -->";
const MARK_END = "<!-- impeccable-axi:end -->";
const PATCHED_SIGN = "impeccable-axi detect";

/**
 * `"<skill-base-dir>/scripts/impeccable" detect [flags] --json [rest]` (trong code block hoặc
 * backtick) ⇒ `impeccable-axi detect [flags] [rest]`. --json đứng giữa (ví dụ `--cdp … --json`) vẫn khớp.
 */
const DETECT_JSON = /"<skill-base-dir>\/scripts\/impeccable" detect((?: [^`\n]*?)?) --json((?: [^`\n]*)?)/g;
const EXIT_LINE = "- Exit code 0 = clean; 2 = findings.";
const SAME_JSON = "It returns the same JSON as a URL scan";
const EXIT_LINE_NEW =
  "- impeccable-axi exits 0 whenever the scan ran, clean or not: read `status` for the counts. Drill down with `--rule <id>`, `--file <part of path>`, `--full`.";

const SKILL_NOTE = `${MARK_BEGIN}
## Detector output (local patch: impeccable-axi)

On this machine detector scans go through \`impeccable-axi detect\` (same targets and flags as \`detect\`, JSON implied). It prints a TOON summary: totals, a rules table with each rule's fix once, findings per file, then the first 20 findings interleaved across rules. Raw \`detect --json\` reaches hundreds of KB on built sites and gets cut off by the shell tool. Drill down with \`--rule <id>\`, \`--file <part of path>\`, \`--limit <n>\` or \`--full\`. If \`impeccable-axi\` is not on PATH, fall back to \`"\${CLAUDE_SKILL_DIR}/scripts/impeccable" detect --json\`.
${MARK_END}
`;

export function patchText(name: string, text: string): { text: string; replacements: number } {
  let n = 0;
  let out = text.replace(DETECT_JSON, (_m, before: string, after: string) => {
    n++;
    return `impeccable-axi detect${before}${after}`;
  });
  if (n && out.includes(EXIT_LINE)) {
    out = out.replace(EXIT_LINE, EXIT_LINE_NEW);
    n++;
  }
  // Câu ngay sau lệnh --cdp (audit.md, critique.md) còn nói "JSON".
  if (n && out.includes(SAME_JSON)) {
    out = out.replaceAll(SAME_JSON, "It returns the same summary as a URL scan");
    n++;
  }
  if (name === "SKILL.md" && !out.includes(MARK_BEGIN)) {
    out = `${out.replace(/\s*$/, "\n")}\n${SKILL_NOTE}`;
    n++;
  }
  return { text: out, replacements: n };
}

/** SKILL.md + reference/*.md, đường dẫn tương đối dấu `/`. */
function skillFiles(dir: string): string[] {
  const refs = existsSync(join(dir, "reference"))
    ? readdirSync(join(dir, "reference")).filter((f) => f.endsWith(".md")).sort().map((f) => `reference/${f}`)
    : [];
  return ["SKILL.md", ...refs];
}

export async function patchCommand(args: string[], rt: Runtime): Promise<Record<string, unknown>> {
  const p = parseCommandArgs(
    "patch-skill",
    args,
    {
      revert: { type: "boolean", hint: "--revert" },
      "dry-run": { type: "boolean", hint: "--dry-run" },
      "skill-dir": { type: "string", hint: "--skill-dir <path>" },
    },
    { max: 0 },
  );
  const dir = p.str("skill-dir") ?? skillDir(rt);
  if (!existsSync(join(dir, "SKILL.md"))) {
    fail(`no Impeccable skill at ${dir}`, "SKILL_MISSING", ["Pass --skill-dir <path> or set IMPECCABLE_SKILL_DIR"]);
  }
  const dry = p.bool("dry-run");
  const backup = join(dir, BACKUP_DIR);
  return p.bool("revert") ? revert(dir, backup, dry) : patch(dir, backup, dry);
}

function patch(dir: string, backup: string, dry: boolean): Record<string, unknown> {
  const changed: Array<{ file: string; replacements: number }> = [];
  let already = 0;
  let textMode = 0;
  for (const rel of skillFiles(dir)) {
    const path = join(dir, rel);
    const text = readFileSync(path, "utf8");
    textMode += (text.match(/"<skill-base-dir>\/scripts\/impeccable" detect (?![^`\n]*--json)/g) ?? []).length;
    if (text.includes(PATCHED_SIGN) || text.includes(MARK_BEGIN)) {
      already++;
      continue;
    }
    const r = patchText(rel.split("/").pop()!, text);
    if (!r.replacements) continue;
    changed.push({ file: rel, replacements: r.replacements });
    if (dry) continue;
    try {
      mkdirSync(dirname(join(backup, rel)), { recursive: true });
      copyFileSync(path, join(backup, rel));
      writeFileSync(path, r.text);
    } catch (e) {
      fail(`could not patch ${rel}: ${(e as Error).message}`, "IO_ERROR");
    }
  }
  const verb = dry ? "would patch" : "patched";
  return {
    skill: dir,
    status: changed.length
      ? `${verb} ${changed.length} files${already ? `, ${already} already patched` : ""}`
      : already
        ? `already patched (${already} files)`
        : "nothing to patch: no `detect --json` calls found",
    changed: changed.length ? changed : "0 files changed",
    ...(textMode ? { untouched: `${textMode} text-mode detect calls left as they are` } : {}),
    help: changed.length && !dry
      ? ["Start a new Claude Code session so the patched skill is loaded", "Run `impeccable-axi patch-skill --revert` to undo"]
      : [],
  };
}

function revert(dir: string, backup: string, dry: boolean): Record<string, unknown> {
  if (!existsSync(backup)) {
    return { skill: dir, status: "nothing to revert: no backup found", help: [] };
  }
  const restored: string[] = [];
  for (const rel of skillFiles(dir)) {
    const saved = join(backup, rel);
    if (!existsSync(saved)) continue;
    // Bản hiện tại không còn dấu patch ⇒ skill đã được chép đè bản mới: đừng ghi đè bằng bản cũ.
    if (!readFileSync(join(dir, rel), "utf8").includes("impeccable-axi")) continue;
    restored.push(rel);
    if (!dry) copyFileSync(saved, join(dir, rel));
  }
  if (!dry) rmSync(backup, { recursive: true, force: true });
  return {
    skill: dir,
    status: `${dry ? "would restore" : "restored"} ${restored.length} files`,
    restored: restored.length ? restored : "0 files restored",
    help: [],
  };
}
