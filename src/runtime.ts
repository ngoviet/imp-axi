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

const IS_CMD = /\.(cmd|bat)$/i;

/**
 * Launcher .cmd/.bat bắt buộc phải qua cmd.exe, mà Node chỉ nối đối số bằng dấu cách (dấu cách
 * trong đường dẫn tách đôi đối số, `&` chạy lệnh thứ hai). Bọc nháy từng đối số: trong "…" cmd.exe
 * coi `& | < > ^ !` là chữ; dấu `\` cuối nhân đôi để exe không đọc thành `\"`. Riêng `"`, xuống
 * dòng và `%biến%` đã định nghĩa thì cmd.exe vẫn diễn giải ⇒ trả lỗi thay vì chạy sai.
 */
export function cmdShellArgs(
  cmd: string,
  args: string[],
  env: Record<string, string | undefined>,
): { cmd: string; args: string[] } | { error: string } {
  const defined = new Set(Object.keys(env).filter((k) => env[k] !== undefined).map((k) => k.toLowerCase()));
  const unsafe = [cmd, ...args].find(
    (a) => /["\r\n]/.test(a) || [...a.matchAll(/%([^%]+)%/g)].some((m) => defined.has(m[1]!.toLowerCase())),
  );
  if (unsafe !== undefined) {
    return { error: `cmd.exe cannot pass this argument through ${cmd} unchanged: ${unsafe}` };
  }
  const q = (a: string) => `"${a.replace(/(\\+)$/, "$1$1")}"`;
  return { cmd: q(cmd), args: args.map(q) };
}

export function defaultRuntime(): Runtime {
  const run: Runtime["run"] = (cmd, args, timeoutMs = 600_000) =>
    new Promise((resolve) => {
      // stdin đóng: engine/launcher mà chờ nhập thì thoát ngay thay vì treo tới hết timeout.
      const opts = { timeout: timeoutMs, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] };
      const started = Date.now();
      let child;
      if (IS_CMD.test(cmd)) {
        const quoted = cmdShellArgs(cmd, args, process.env);
        if ("error" in quoted) return resolve({ code: 127, stdout: "", stderr: quoted.error });
        // Một dòng lệnh đã bọc nháy (không truyền mảng đối số kèm shell: Node nối mà không bọc — DEP0190).
        child = spawn([quoted.cmd, ...quoted.args].join(" "), { ...opts, shell: true });
      } else {
        child = spawn(cmd, args, opts);
      }
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      child.on("error", (e) => resolve({ code: 127, stdout, stderr: stderr + e.message }));
      // Bị kill (timeout hoặc tín hiệu ngoài) ⇒ 124 như `timeout(1)`, để bên gọi báo đúng nguyên nhân.
      child.on("close", (code, signal) => {
        if (code !== null || !signal) return resolve({ code: code ?? 1, stdout, stderr });
        const secs = Math.round((Date.now() - started) / 1000);
        const why = Date.now() - started >= timeoutMs ? `timed out after ${secs}s` : `killed by ${signal} after ${secs}s`;
        resolve({ code: 124, stdout, stderr: `${stderr}${stderr && !stderr.endsWith("\n") ? "\n" : ""}${cmd}: ${why}` });
      });
    });
  return { env: process.env, home: homedir(), cwd: process.cwd(), run };
}
