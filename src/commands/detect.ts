import { readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { type FlagSpec, listFlag, parseCommandArgs } from "../args.js";
import { prepareEngine } from "../engine.js";
import { fail } from "../errors.js";
import type { Runtime } from "../runtime.js";
import { assertFields, clip, commandLine, quote, type Row, shortPath, tally } from "../views.js";

export const DETECT_HELP = `usage: impeccable-axi detect <file|dir|url>... [flags]
description: Run the Impeccable detector (detect --json) and print a TOON summary: counts by rule and file, each rule's fix once, then the first findings interleaved across rules so one page covers every rule
flags[17]:
  --rule <id,id>: only these rules (ids from the rules table)
  --file <text>: only files whose path contains this text
  --sort rule|file: rule (default) interleaves rules; file lists in file/line order
  --limit <n>: findings to show (default 20)
  --full: every finding, untruncated rule descriptions
  --fields a,b: finding columns (default file,line,rule,snippet; also severity,category,advisory,path)
  --scope <type,layout>: engine: only rules in these design domains
  --viewport <WxH>: engine: viewport for URL scans (default 1280x800)
  --cdp <port|url>: engine: scan a running Chromium desktop app page (no targets)
  --target <text>: engine, with --cdp: pick the page whose URL or title contains this
  --no-advisory: engine: drop advisory findings
  --no-config: engine: ignore project config, ignores and DESIGN.md
  --no-design-system: engine: do not load DESIGN.md / .impeccable/design.json
  --no-inline-ignores: engine: ignore impeccable-disable comments
  --no-consent-hiding: engine: keep consent banners on URL scans
  --no-overlay-hiding: engine: keep product tours/preloaders on URL scans
  --help: this help
notes[3]:
  Exit 0 whenever the scan ran, clean or not: read \`status\`. Exit 1 = engine missing or scan failed
  Source files (.jsx/.tsx/.css) get regex rules only; built .html or a dev-server URL runs the full rule set
  Engine: IMPECCABLE_BIN, else the skill's bundled binary, else ~/.impeccable/bin/<skill VERSION>/, else the skill launcher (downloads once)
examples[3]:
  impeccable-axi detect src
  impeccable-axi detect dist --rule low-contrast,tiny-text
  impeccable-axi detect http://localhost:5173 --viewport 390x844
`;

/** Flag chuyển nguyên cho engine. */
const ENGINE_STRING_FLAGS = ["scope", "viewport", "cdp", "target"] as const;
const ENGINE_BOOL_FLAGS = [
  "no-advisory",
  "no-config",
  "no-design-system",
  "no-inline-ignores",
  "no-consent-hiding",
  "no-overlay-hiding",
] as const;

const FLAGS: Record<string, FlagSpec> = {
  rule: { type: "string", hint: "--rule <id,id>" },
  file: { type: "string", hint: "--file <text>" },
  sort: { type: "string", hint: "--sort rule|file" },
  ...Object.fromEntries(ENGINE_STRING_FLAGS.map((f) => [f, { type: "string", hint: `--${f} <v>` }])),
  ...Object.fromEntries(ENGINE_BOOL_FLAGS.map((f) => [f, { type: "boolean", hint: `--${f}` }])),
};

const DEFAULT_FIELDS = ["file", "line", "rule", "snippet"] as const;
const AVAILABLE_FIELDS = ["file", "line", "rule", "snippet", "severity", "category", "advisory", "path"] as const;
const DEFAULT_LIMIT = 20;
const WHY_LIMIT = 140;
const TOP_FILES = 10;

/** Một phát hiện như engine in ra với --json (đo trên engine 0.1.16). */
export interface Finding {
  antipattern: string;
  name?: string;
  description?: string;
  severity?: string;
  category?: string;
  file: string;
  line?: number;
  snippet?: string;
  advisory?: boolean;
}

const isAdvisory = (f: Finding): boolean => f.advisory === true || f.severity === "advisory";

export async function detectCommand(args: string[], rt: Runtime): Promise<Record<string, unknown>> {
  const p = parseCommandArgs("detect", args, FLAGS, { min: 0, max: Infinity });
  const cdp = p.str("cdp");
  const targets = p.positionals;
  if (!targets.length && !cdp) {
    fail("detect: give a file, directory or URL to scan", "VALIDATION_ERROR", ["Run `impeccable-axi detect --help` for usage"]);
  }
  if (targets.length && cdp) fail("detect: --cdp takes no file or URL targets", "VALIDATION_ERROR");
  const sort = p.str("sort") ?? "rule";
  if (sort !== "rule" && sort !== "file") fail("--sort must be rule or file", "VALIDATION_ERROR");
  const fields = p.global.fields ?? [...DEFAULT_FIELDS];
  assertFields(fields, AVAILABLE_FIELDS);
  const ruleFilter = listFlag(p, "rule");
  const fileFilter = p.str("file")?.toLowerCase();

  const engine = await prepareEngine(rt);
  const engineArgs = ["detect", "--json"];
  for (const f of ENGINE_STRING_FLAGS) {
    const v = p.str(f);
    if (v !== undefined) engineArgs.push(`--${f}`, v);
  }
  for (const f of ENGINE_BOOL_FLAGS) if (p.bool(f)) engineArgs.push(`--${f}`);
  engineArgs.push(...targets);

  const res = await rt.run(engine.path, engineArgs);
  if (res.code === 127) {
    fail(`Impeccable engine did not start (${engine.via}: ${engine.path})`, "ENGINE_MISSING", [
      clip(res.stderr.trim().split(/\r?\n/)[0] ?? "", 300),
      "Set IMPECCABLE_BIN to an engine binary from https://github.com/pbakaus/impeccable/releases",
    ].filter(Boolean));
  }
  const all = parseFindings(res.stdout);
  if (!all) {
    fail(`detect failed (engine exit ${res.code})`, "SCAN_FAILED", [clip(res.stderr.trim() || res.stdout.trim() || "no output", 500)]);
  }

  // --file: khớp đúng tên trước (URL "https://x.com/" là chuỗi con của mọi trang cùng site), không có mới khớp chuỗi con.
  const fileKey = (f: Finding) => shortPath(f.file, rt.cwd).toLowerCase();
  const exactFile = fileFilter !== undefined && all.some((f) => fileKey(f) === fileFilter);
  const shown = all
    .filter((f) => !ruleFilter || ruleFilter.includes(f.antipattern))
    .filter((f) => !fileFilter || (exactFile ? fileKey(f) === fileFilter : fileKey(f).includes(fileFilter)));
  const filtered = Boolean(ruleFilter || fileFilter);
  const advisoryCount = all.filter(isAdvisory).length;
  const fileCount = new Set(all.map((f) => f.file)).size;

  // Exit 1 = có đích không quét được: 0 phát hiện khi đó không phải "clean".
  const partial = res.code === 1;
  const out: Record<string, unknown> = {
    target: cdp ? `cdp ${cdp}${p.str("target") ? ` (${p.str("target")})` : ""}` : targets.join(" "),
    status: all.length
      ? `${all.length} findings (${all.length - advisoryCount} primary, ${advisoryCount} advisory) in ${fileCount} ${fileCount === 1 ? "file" : "files"}`
      : partial
        ? "incomplete: 0 findings in what was scanned, some targets failed (see attention)"
        : "clean: 0 findings",
  };
  if (!cdp && !targets.some((t) => hasMarkup(t, rt.cwd))) {
    out["coverage"] =
      "regex rules only (no .html or URL in the targets): element rules such as low-contrast and tiny-text did not run, so this is an undercount. Scan built .html or a dev-server URL for the full check";
  }
  if (partial) {
    out["attention"] = `some targets could not be scanned: ${clip(res.stderr.trim().split(/\r?\n/).filter(Boolean).join(" | "), 400)}`;
  }
  if (filtered) {
    out["filter"] = `${[ruleFilter && `rule=${ruleFilter.join(",")}`, fileFilter && `file~${p.str("file")}`].filter(Boolean).join(" ")}: ${shown.length} of ${all.length}`;
  }

  const help: string[] = [];
  const prefix = "impeccable-axi detect";
  if (shown.length) {
    out["rules"] = ruleTable(shown, p.global.full);
    const files = tally(shown, (f) => shortPath(f.file, rt.cwd));
    out["files"] =
      files.slice(0, TOP_FILES).map(([f, n]) => `${f} ${n}`).join(", ") +
      (files.length > TOP_FILES && !p.global.full ? ` (+${files.length - TOP_FILES} more files)` : "");
    const ordered = sort === "file" ? byFile(shown) : interleave(shown);
    const limit = p.global.full ? Infinity : (p.global.limit ?? DEFAULT_LIMIT);
    const rows = ordered.slice(0, limit).map((f) => toRow(f, fields, rt.cwd));
    out["count"] = rows.length < shown.length ? `${rows.length} of ${shown.length} total` : shown.length;
    out["findings"] = rows;
    if (rows.length < shown.length) {
      const topRule = tally(shown, (f) => f.antipattern)[0]![0];
      const topFile = files[0]![0];
      if (!ruleFilter) help.push(rerun(commandLine(prefix, args, ["--rule"]), `--rule ${topRule}`, "to list one rule"));
      if (!fileFilter && files.length > 1) help.push(rerun(commandLine(prefix, args, ["--file"]), `--file ${quote(topFile)}`, "to list one file"));
      help.push(rerun(commandLine(prefix, args), "--full", `to list all ${shown.length}`));
    }
    help.push("After fixing, rerun the same command to confirm the counts dropped");
  } else {
    out["findings"] = "0 findings found";
    if (partial) help.push("Fix or drop the targets named in `attention`, then rerun");
    if (filtered && all.length) {
      help.push(`Rules present: ${tally(all, (f) => f.antipattern).map(([r]) => r).join(", ")}`);
    }
  }
  return { ...out, help };
}

const RERUN_MAX = 120;

/** Gợi ý chạy lại: in nguyên lệnh khi ngắn; lệnh dài (nhiều URL) thì chỉ nêu flag cần thêm, khỏi lặp danh sách đích. */
function rerun(command: string, flag: string, purpose: string): string {
  return command.length <= RERUN_MAX ? `Run \`${command} ${flag}\` ${purpose}` : `Add \`${flag}\` to the same command ${purpose}`;
}

/** stdout của engine ⇒ mảng phát hiện; undefined nếu không phải JSON đúng dạng. */
export function parseFindings(stdout: string): Finding[] | undefined {
  const text = stdout.trim();
  if (!text) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  const list = Array.isArray(data) ? data : (data as { findings?: unknown }).findings;
  if (!Array.isArray(list)) return undefined;
  return list.filter((f): f is Finding => typeof f === "object" && f !== null && typeof (f as Finding).antipattern === "string");
}

/** Mỗi luật một dòng: số primary/advisory và cách sửa (mô tả luật in MỘT lần thay vì lặp ở mọi phát hiện). */
function ruleTable(findings: Finding[], full: boolean): Row[] {
  const by = new Map<string, { category: string; primary: number; advisory: number; why: string }>();
  for (const f of findings) {
    const r = by.get(f.antipattern) ?? { category: f.category ?? "", primary: 0, advisory: 0, why: f.description ?? f.name ?? "" };
    if (isAdvisory(f)) r.advisory++;
    else r.primary++;
    by.set(f.antipattern, r);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].primary - a[1].primary || b[1].advisory - a[1].advisory || a[0].localeCompare(b[0]))
    .map(([rule, r]) => ({
      rule,
      category: r.category,
      primary: r.primary,
      advisory: r.advisory,
      why: full ? r.why : clip(r.why, WHY_LIMIT),
    }));
}

/**
 * Xếp xen kẽ: primary trước advisory; trong mỗi nhóm lấy lần lượt phát hiện thứ 1, 2… của từng luật
 * (luật nhiều phát hiện trước) ⇒ 20 dòng đầu phủ mọi luật thay vì 20 dòng cùng một luật.
 */
export function interleave(findings: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const group of [findings.filter((f) => !isAdvisory(f)), findings.filter(isAdvisory)]) {
    const byRule = new Map<string, Finding[]>();
    for (const f of byFile(group)) {
      const list = byRule.get(f.antipattern) ?? [];
      list.push(f);
      byRule.set(f.antipattern, list);
    }
    const queues = [...byRule.values()].sort((a, b) => b.length - a.length || a[0]!.antipattern.localeCompare(b[0]!.antipattern));
    for (let i = 0; queues.some((q) => i < q.length); i++) {
      for (const q of queues) if (i < q.length) out.push(q[i]!);
    }
  }
  return out;
}

function byFile(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
}

function toRow(f: Finding, fields: readonly string[], cwd: string): Row {
  const all: Row = {
    file: shortPath(f.file, cwd),
    line: f.line ? f.line : "", // engine ghi 0 cho luật phần tử HTML (không có số dòng)
    rule: f.antipattern,
    snippet: f.snippet ?? "",
    severity: f.severity ?? "",
    category: f.category ?? "",
    advisory: isAdvisory(f),
    path: f.file,
  };
  return Object.fromEntries(fields.map((k) => [k, all[k] ?? ""]));
}

const MARKUP = new Set([".html", ".htm"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** Đích có chạy được luật phần tử không: URL, file .html, hoặc thư mục chứa .html (duyệt tối đa 20k mục). */
export function hasMarkup(target: string, cwd: string): boolean {
  if (/^[a-z]+:\/\//i.test(target)) return true;
  const abs = resolve(cwd, target);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return true; // không đọc được ⇒ để engine báo lỗi, đừng chèn ghi chú sai
  }
  if (st.isFile()) return MARKUP.has(extname(abs).toLowerCase());
  const stack = [abs];
  let budget = 20_000;
  while (stack.length && budget > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (--budget <= 0) return true; // cây quá lớn: đừng khẳng định thiếu HTML
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(join(dir, e.name));
      } else if (MARKUP.has(extname(e.name).toLowerCase())) return true;
    }
  }
  return false;
}
