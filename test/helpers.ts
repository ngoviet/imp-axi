import { readFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../src/cli.js";
import type { Runtime } from "../src/runtime.js";

export const fixture = (name: string): string => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

export interface FakeRun {
  code: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Runtime giả: engine = file có thật (IMPECCABLE_BIN trỏ vào chính Node) nhưng `run` trả kết quả
 * dựng sẵn và ghi lại đối số ⇒ không chạy engine thật.
 */
export function fakeRuntime(result: FakeRun, extra: Partial<Runtime> = {}): Runtime & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    env: { IMPECCABLE_BIN: process.execPath },
    home: "/nonexistent-home",
    cwd: "/proj",
    run: async (cmd, args) => {
      calls.push([cmd, ...args]);
      return { code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
    },
    ...extra,
  };
}

/** Chạy CLI trong tiến trình, trả stdout + exit code (SDK đặt process.exitCode). */
export async function runCli(argv: string[], rt: Runtime): Promise<{ out: string; code: number }> {
  let out = "";
  const before = process.exitCode;
  process.exitCode = 0;
  await main({ argv, runtime: rt, stdout: { write: (c: string) => (out += c) } });
  const code = Number(process.exitCode ?? 0);
  process.exitCode = before;
  return { out, code };
}
