import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./errors.js";
import type { Runtime } from "./runtime.js";

export interface Engine {
  path: string;
  /** env = IMPECCABLE_BIN · cache = binary đã tải theo VERSION của skill · launcher = script của skill (tự tải lần đầu). */
  via: "env" | "cache" | "launcher";
}

const IS_WIN = process.platform === "win32";
const EXE = IS_WIN ? "impeccable.exe" : "impeccable";

/** Thư mục skill Impeccable: IMPECCABLE_SKILL_DIR hoặc ~/.claude/skills/impeccable. */
export function skillDir(rt: Runtime): string {
  return rt.env["IMPECCABLE_SKILL_DIR"] || join(rt.home, ".claude", "skills", "impeccable");
}

/** Phiên bản engine mà skill ghim (scripts/VERSION), vd "0.1.16". */
export function skillEngineVersion(rt: Runtime): string | undefined {
  try {
    return readFileSync(join(skillDir(rt), "scripts", "VERSION"), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cùng thứ tự với launcher của skill, nhưng ưu tiên gọi thẳng binary trong cache: không qua
 * cmd.exe (đường dẫn có dấu cách, ký tự `%`/`!` đi nguyên văn) và nhanh hơn. Launcher chỉ là
 * phương án cuối — nó tải engine (kiểm sha256) khi cache chưa có.
 */
export function findEngine(rt: Runtime): Engine | undefined {
  const envBin = rt.env["IMPECCABLE_BIN"];
  if (envBin && existsSync(envBin)) return { path: envBin, via: "env" };
  const version = skillEngineVersion(rt);
  if (version) {
    const cacheRoot = rt.env["IMPECCABLE_HOME"] || join(rt.home, ".impeccable");
    const cached = join(cacheRoot, "bin", version, EXE);
    if (existsSync(cached)) return { path: cached, via: "cache" };
  }
  const launcher = join(skillDir(rt), "scripts", IS_WIN ? "impeccable.cmd" : "impeccable");
  if (existsSync(launcher)) return { path: launcher, via: "launcher" };
  return undefined;
}

export function requireEngine(rt: Runtime): Engine {
  const engine = findEngine(rt);
  if (!engine) {
    fail(`Impeccable engine not found (skill dir: ${skillDir(rt)})`, "ENGINE_MISSING", [
      "Install the Impeccable skill into ~/.claude/skills/impeccable (or set IMPECCABLE_SKILL_DIR)",
      "Or set IMPECCABLE_BIN to an engine binary from https://github.com/pbakaus/impeccable/releases",
    ]);
  }
  return engine;
}
