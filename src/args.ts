import { parseArgs } from "node:util";
import { fail } from "./errors.js";

export interface FlagSpec {
  type: "string" | "boolean";
  hint: string;
}

/** Flag toàn cục — mọi lệnh đều nhận. */
export const GLOBAL_FLAGS = {
  fields: { type: "string", hint: "--fields a,b" },
  full: { type: "boolean", hint: "--full" },
  limit: { type: "string", hint: "--limit <n>" },
  help: { type: "boolean", hint: "--help" },
} as const satisfies Record<string, FlagSpec>;

export interface GlobalFlags {
  fields?: string[];
  full: boolean;
  limit?: number;
}

export interface ParsedArgs {
  positionals: string[];
  global: GlobalFlags;
  str: (k: string) => string | undefined;
  bool: (k: string) => boolean;
}

/**
 * Flag lạ / thiếu giá trị / thừa đối số ⇒ VALIDATION_ERROR (exit 2) kèm danh sách flag hợp lệ.
 * `min` thiếu ⇒ cũng exit 2 kèm usage của lệnh.
 */
export function parseCommandArgs(
  command: string,
  args: string[],
  extra: Record<string, FlagSpec> = {},
  positionals: { min?: number; max?: number; usage?: string } = {},
): ParsedArgs {
  const specs: Record<string, FlagSpec> = { ...GLOBAL_FLAGS, ...extra };
  const valid = Object.values(specs).map((s) => s.hint);
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      options: Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, { type: s.type }])),
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    fail(`${command}: ${(e as Error).message.split("\n")[0]}`, "VALIDATION_ERROR", [`Valid flags: ${valid.join(", ")}`]);
  }
  const usageHelp = [`Run \`impeccable-axi ${command} --help\` for usage`];
  const { min = 0, max = min } = positionals;
  if (parsed.positionals.length < min) {
    fail(`${command}: missing argument${positionals.usage ? ` (${positionals.usage})` : ""}`, "VALIDATION_ERROR", usageHelp);
  }
  if (parsed.positionals.length > max) {
    fail(`${command}: unexpected argument ${parsed.positionals[max]}`, "VALIDATION_ERROR", usageHelp);
  }
  const v = parsed.values as Record<string, string | boolean | undefined>;
  const str = (k: string): string | undefined => (typeof v[k] === "string" ? (v[k] as string) : undefined);
  const fields = str("fields");
  const limitRaw = str("limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limitRaw !== undefined && (!Number.isInteger(limit) || limit! < 1)) {
    fail(`${command}: --limit must be a positive integer`, "VALIDATION_ERROR");
  }
  return {
    positionals: parsed.positionals,
    str,
    bool: (k) => v[k] === true,
    global: {
      ...(fields ? { fields: fields.split(",").map((f) => f.trim()).filter(Boolean) } : {}),
      full: v["full"] === true,
      ...(limit !== undefined ? { limit } : {}),
    },
  };
}

/** "a, b,c" ⇒ ["a","b","c"]; undefined nếu không có flag. */
export function listFlag(p: ParsedArgs, name: string): string[] | undefined {
  const raw = p.str(name);
  if (raw === undefined) return undefined;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!items.length) fail(`--${name} needs at least one value`, "VALIDATION_ERROR");
  return items;
}
