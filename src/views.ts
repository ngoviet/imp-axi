import { fail } from "./errors.js";

export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;

/** Kiểm --fields TRƯỚC khi chạy engine (dùng sai không nên tốn một lượt quét). */
export function assertFields(fields: readonly string[] | undefined, available: readonly string[]): void {
  const unknown = (fields ?? []).filter((f) => !available.includes(f));
  if (unknown.length) {
    fail(`unknown field: ${unknown.join(", ")}`, "VALIDATION_ERROR", [`Available fields: ${available.join(", ")}`]);
  }
}

export function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}… (+${s.length - max + 1} chars)` : s;
}

/** Đếm theo khoá, trả [khoá, số] theo số giảm dần rồi theo tên. */
export function tally<T>(items: T[], key: (t: T) => string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Dựng lại lệnh để gợi ý trong help[]: bỏ --limit/--full và các flag sẽ được thay (vd --rule),
 * bọc nháy đối số có khoảng trắng hoặc ký tự shell.
 */
export function commandLine(prefix: string, args: string[], drop: readonly string[] = []): string {
  const withValue = new Set(["--limit", "--fields", ...drop]);
  const kept: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--full") continue;
    // parseArgs nhận cả `--limit=5` ⇒ bỏ dạng này giống `--limit 5`.
    if (a.startsWith("--") && withValue.has(a.split("=")[0]!) && a.includes("=")) continue;
    if (withValue.has(a)) {
      i++;
      continue;
    }
    kept.push(quote(a));
  }
  return [prefix, ...kept].join(" ");
}

export function quote(a: string): string {
  return /^[\w./:@,=\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`;
}

/** Đường dẫn tuyệt đối dưới cwd ⇒ tương đối, dấu `/` (gọn và dán lại được vào lệnh). */
export function shortPath(file: string, cwd: string): string {
  if (/^[a-z]+:\/\//i.test(file)) return file;
  const norm = (p: string) => p.replace(/\\/g, "/");
  const f = norm(file);
  const base = norm(cwd).replace(/\/$/, "");
  const lower = process.platform === "win32";
  const starts = lower ? f.toLowerCase().startsWith(`${base.toLowerCase()}/`) : f.startsWith(`${base}/`);
  return starts ? f.slice(base.length + 1) : f;
}
