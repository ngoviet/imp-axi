import { spawn } from "node:child_process";
import { homedir } from "node:os";

/** Mọi I/O với tiến trình ngoài đi qua đây ⇒ test thay bằng bản giả, không chạy engine thật. */
export interface Runtime {
  env: Record<string, string | undefined>;
  /** Thư mục home (tìm ~/.claude/skills/impeccable và ~/.impeccable/bin). */
  home: string;
  cwd: string;
  /** Chạy file thực thi KHÔNG qua shell ⇒ đối số (đường dẫn có dấu cách) đi nguyên văn. */
  run: (cmd: string, args: string[], timeoutMs?: number) => Promise<{ code: number; stdout: string; stderr: string }>;
}

export function defaultRuntime(): Runtime {
  const run: Runtime["run"] = (cmd, args, timeoutMs = 600_000) =>
    new Promise((resolve) => {
      // Riêng launcher .cmd/.bat bắt buộc phải qua shell (chỉ dùng khi chưa có binary trong cache).
      const child = spawn(cmd, args, {
        shell: /\.(cmd|bat)$/i.test(cmd),
        timeout: timeoutMs,
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      child.on("error", (e) => resolve({ code: 127, stdout, stderr: stderr + e.message }));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  return { env: process.env, home: homedir(), cwd: process.cwd(), run };
}
