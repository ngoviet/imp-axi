import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { interleave, parseFindings, type Finding } from "../src/commands/detect.js";
import { tilde } from "../src/commands/home.js";
import { BACKUP_DIR, patchText } from "../src/commands/patch.js";
import { cmdShellArgs, defaultRuntime } from "../src/runtime.js";
import { VERSION } from "../src/version.js";
import { fakeRuntime, fixture, runCli } from "./helpers.js";

const root = join(import.meta.dirname, "..");
const FINDINGS = fixture("findings.json");

describe("contract", () => {
  it("version matches package.json and the fast path answers without loading commands", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; scripts: Record<string, string> };
    expect(VERSION).toBe(pkg.version);
    // install:global đọc version từ package.json, không ghim tên .tgz (chỗ thứ ba phải sửa khi đổi version).
    expect(pkg.scripts["install:global"]).not.toContain(pkg.version);
    const out = execFileSync(process.execPath, [join(root, "dist/bin/impeccable-axi.js"), "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe(VERSION);
  });

  it("unknown flags fail loud with exit 2 and list the valid flags", async () => {
    const { out, code } = await runCli(["detect", "dist", "--bogus"], fakeRuntime({ code: 0, stdout: "[]" }));
    expect(code).toBe(2);
    expect(out).toContain("code: VALIDATION_ERROR");
    expect(out).toContain("--rule <id,id>");
  });

  it("validates --fields before running the engine", async () => {
    const rt = fakeRuntime({ code: 0, stdout: "[]" });
    const { out, code } = await runCli(["detect", "dist", "--fields", "bad"], rt);
    expect(code).toBe(2);
    expect(out).toContain("unknown field: bad");
    expect(rt.calls).toHaveLength(0);
  });

  it("detect without a target is a usage error", async () => {
    const { out, code } = await runCli(["detect"], fakeRuntime({ code: 0, stdout: "[]" }));
    expect(code).toBe(2);
    expect(out).toContain("give a file, directory or URL");
  });
});

describe("detect", () => {
  it("summarises by rule and file, prints each rule's fix once, exits 0 on findings", async () => {
    const rt = fakeRuntime({ code: 2, stdout: FINDINGS });
    const { out, code } = await runCli(["detect", "dist", "--limit", "4"], rt);
    expect(code).toBe(0);
    expect(rt.calls[0]).toEqual([process.execPath, "detect", "--json", "dist"]);
    expect(out).toContain('status: "11 findings (9 primary, 2 advisory) in 5 files"');
    expect(out).toContain("rules[4]{rule,category,primary,advisory,why}:");
    expect(out).toMatch(/cramped-padding,quality,5,0,/);
    expect(out).toMatch(/low-contrast,quality,3,1,/);
    // mô tả luật xuất hiện đúng một lần dù luật có 5 phát hiện
    expect(out.match(/Text is too close to the edge/g)).toHaveLength(1);
    expect(out).toContain('files: "dist/about.html 3, dist/faq.html 3, dist/index.html 3,');
    expect(out).toContain("count: 4 of 11 total");
    expect(out).toContain("findings[4]{file,line,rule,snippet}:");
    expect(out).toContain("--rule cramped-padding` to list one rule");
    expect(out).toContain("--full` to list all 11");
  });

  it("interleaves rules so the first rows cover every primary rule, advisories last", () => {
    const order = interleave(parseFindings(FINDINGS)!).map((f) => f.antipattern);
    expect(order.slice(0, 3)).toEqual(["cramped-padding", "low-contrast", "gradient-text"]);
    expect(order.slice(-2).sort()).toEqual(["em-dash-overuse", "low-contrast"]);
  });

  it("shortens paths under cwd and blanks the engine's line 0", async () => {
    const { out } = await runCli(["detect", "dist", "--rule", "gradient-text,cramped-padding", "--file", "about"], fakeRuntime({ code: 2, stdout: FINDINGS }));
    expect(out).toContain('filter: "rule=gradient-text,cramped-padding file~about: 2 of 11"');
    expect(out).toContain("dist/about.html,\"\",cramped-padding");
    expect(out).not.toContain("/proj/");
  });

  it("--sort file lists in file order with line numbers kept", async () => {
    const { out } = await runCli(["detect", "dist", "--sort", "file", "--rule", "gradient-text"], fakeRuntime({ code: 2, stdout: FINDINGS }));
    expect(out).toContain("dist/assets/index.css,652,gradient-text");
  });

  it("says 0 findings found and names the rules present when a filter matches nothing", async () => {
    const { out, code } = await runCli(["detect", "dist", "--rule", "tiny-text"], fakeRuntime({ code: 2, stdout: FINDINGS }));
    expect(code).toBe(0);
    expect(out).toContain("findings: 0 findings found");
    expect(out).toContain("Rules present: cramped-padding, low-contrast");
  });

  it("URL targets: --file matches a page exactly and long commands are not repeated in help", async () => {
    const site = "https://example-school.test";
    const pages = ["/", "/pricing", "/about", "/contact", "/roadmap"].map((p) => `${site}${p}`);
    const urlFindings = pages.flatMap((file, i) =>
      Array.from({ length: i === 0 ? 4 : 2 }, (_, n) => ({ antipattern: n % 2 ? "tiny-text" : "low-contrast", file, line: 0, snippet: `s${n}` })),
    );
    const rt = () => fakeRuntime({ code: 2, stdout: JSON.stringify(urlFindings) });
    const all = await runCli(["detect", ...pages, "--limit", "3"], rt());
    expect(all.out).toContain(`Add \`--file ${site}/\` to the same command to list one file`);
    expect(all.out).not.toContain(`Run \`impeccable-axi detect ${site}/ ${site}/pricing`);
    const home = await runCli(["detect", ...pages, "--file", `${site}/`], rt());
    expect(home.out).toContain(`file~${site}/: 4 of 12`);
  });

  it("a clean scan is definitive", async () => {
    const { out } = await runCli(["detect", "dist"], fakeRuntime({ code: 0, stdout: "[]" }));
    expect(out).toContain("status: \"clean: 0 findings\"");
    expect(out).toContain("findings: 0 findings found");
  });

  it("passes engine flags through", async () => {
    const rt = fakeRuntime({ code: 0, stdout: "[]" });
    await runCli(["detect", "http://localhost:5173", "--viewport", "390x844", "--no-advisory", "--scope", "type"], rt);
    expect(rt.calls[0]).toEqual([process.execPath, "detect", "--json", "--scope", "type", "--viewport", "390x844", "--no-advisory", "http://localhost:5173"]);
  });

  it("warns that source-only targets ran regex rules only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iaxi-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "App.jsx"), "export default () => null;\n");
    const { out } = await runCli(["detect", "src"], fakeRuntime({ code: 0, stdout: "[]" }, { cwd: dir }));
    expect(out).toContain("coverage: ");
    expect(out).toContain("undercount");
  });

  it("engine missing ⇒ ENGINE_MISSING with how to get it", async () => {
    const { out, code } = await runCli(["detect", "dist"], fakeRuntime({ code: 0 }, { env: {} }));
    expect(code).toBe(1);
    expect(out).toContain("code: ENGINE_MISSING");
    expect(out).toContain("IMPECCABLE_BIN");
  });

  it("non-JSON engine output ⇒ SCAN_FAILED with the engine's message", async () => {
    const { out, code } = await runCli(["detect", "nope"], fakeRuntime({ code: 1, stderr: "nope: no such file" }));
    expect(code).toBe(1);
    expect(out).toContain("code: SCAN_FAILED");
    expect(out).toContain("nope: no such file");
  });

  it("partial scan keeps the findings and flags the failed target", async () => {
    const { out, code } = await runCli(["detect", "dist", "missing.html"], fakeRuntime({ code: 1, stdout: FINDINGS, stderr: "missing.html: not found" }));
    expect(code).toBe(0);
    expect(out).toContain("attention: \"some targets could not be scanned: missing.html: not found\"");
  });

  it("--file accepts Windows backslashes", async () => {
    const { out } = await runCli(["detect", "dist", "--file", "dist\\about.html"], fakeRuntime({ code: 2, stdout: FINDINGS }));
    expect(out).toContain(": 3 of 11");
  });

  it("--limit=n is dropped from suggested commands like --limit n", async () => {
    const { out } = await runCli(["detect", "dist", "--limit=2"], fakeRuntime({ code: 2, stdout: FINDINGS }));
    expect(out).toContain("count: 2 of 11 total");
    expect(out).toContain("Run `impeccable-axi detect dist --full`");
  });

  it("source plus .html targets get a partial coverage note", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iaxi-vite-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "index.html"), "<div id=root></div>\n");
    writeFileSync(join(dir, "src", "App.tsx"), "export default () => null;\n");
    writeFileSync(join(dir, "src", "Card.vue"), "<template><div/></template>\n");
    const { out } = await runCli(["detect", "."], fakeRuntime({ code: 0, stdout: "[]" }, { cwd: dir }));
    expect(out).toContain("partial: element rules ran on the .html only; 2 component files");
    const built = await runCli(["detect", "index.html"], fakeRuntime({ code: 0, stdout: "[]" }, { cwd: dir }));
    expect(built.out).not.toContain("coverage");
  });

  it("an engine killed by the timeout is SCAN_FAILED with the reason", async () => {
    const { out, code } = await runCli(["detect", "dist"], fakeRuntime({ code: 124, stdout: "[{\"antip", stderr: "impeccable: timed out after 600s" }));
    expect(code).toBe(1);
    expect(out).toContain("code: SCAN_FAILED");
    expect(out).toContain("timed out after 600s");
  });

  it("JSON null from the engine is SCAN_FAILED, not a crash", async () => {
    expect(parseFindings("null")).toBeUndefined();
    const { out, code } = await runCli(["detect", "dist"], fakeRuntime({ code: 0, stdout: "null" }));
    expect(code).toBe(1);
    expect(out).toContain("code: SCAN_FAILED");
  });

  it("a broken IMPECCABLE_BIN is named instead of silently ignored", async () => {
    const missing = join(tmpdir(), "no-such-impeccable.exe");
    const { out, code } = await runCli(["detect", "dist"], fakeRuntime({ code: 0 }, { env: { IMPECCABLE_BIN: missing } }));
    expect(code).toBe(1);
    expect(out).toContain("IMPECCABLE_BIN is set but");
  });

  it("exit 1 with no findings is incomplete, not clean", async () => {
    const { out, code } = await runCli(["detect", "missing.html"], fakeRuntime({ code: 1, stdout: "[]", stderr: "missing.html: not found" }));
    expect(code).toBe(0);
    expect(out).not.toContain("clean");
    expect(out).toContain("status: \"incomplete: 0 findings in what was scanned, some targets failed (see attention)\"");
    expect(out).toContain("missing.html: not found");
  });
});

describe("engine via the skill launcher", () => {
  const exe = process.platform === "win32" ? "impeccable.exe" : "impeccable";
  const launcherName = process.platform === "win32" ? "impeccable.cmd" : "impeccable";

  function launcherSkill(): { rt: ReturnType<typeof fakeRuntime>; launcher: string; cached: string } {
    const base = mkdtempSync(join(tmpdir(), "iaxi-launcher-"));
    const skill = join(base, "skill");
    mkdirSync(join(skill, "scripts"), { recursive: true });
    writeFileSync(join(skill, "scripts", "VERSION"), "0.1.16\n");
    const launcher = join(skill, "scripts", launcherName);
    writeFileSync(launcher, "");
    const cacheHome = join(base, ".impeccable");
    const cached = join(cacheHome, "bin", "0.1.16", exe);
    const rt = fakeRuntime({ code: 0, stdout: "[]" }, { env: { IMPECCABLE_SKILL_DIR: skill, IMPECCABLE_HOME: cacheHome } });
    return { rt, launcher, cached };
  }

  it("runs engine-probe first, then scans with the downloaded binary so targets never go through cmd.exe", async () => {
    const { rt, launcher, cached } = launcherSkill();
    const run = rt.run;
    rt.run = async (cmd, args) => {
      // launcher giả: engine-probe "tải" binary vào cache như launcher thật.
      if (args[0] === "engine-probe") {
        mkdirSync(join(cached, ".."), { recursive: true });
        writeFileSync(cached, "");
      }
      return run(cmd, args);
    };
    await runCli(["detect", "my site/dist"], rt);
    expect(rt.calls).toEqual([
      [launcher, "engine-probe"],
      [cached, "detect", "--json", "my site/dist"],
    ]);
  });

  it("falls back to scanning through the launcher when the probe leaves no cached binary", async () => {
    const { rt, launcher } = launcherSkill();
    await runCli(["detect", "dist"], rt);
    expect(rt.calls).toEqual([
      [launcher, "engine-probe"],
      [launcher, "detect", "--json", "dist"],
    ]);
  });

  it("quotes cmd.exe arguments and refuses the ones cmd.exe would rewrite", () => {
    expect(cmdShellArgs("C:\\a b\\impeccable.cmd", ["x&y", "D:\\site\\", "50%20off"], {})).toEqual({
      cmd: '"C:\\a b\\impeccable.cmd"',
      args: ['"x&y"', '"D:\\site\\\\"', '"50%20off"'],
    });
    expect(cmdShellArgs("l.cmd", ['say "hi"'], {})).toHaveProperty("error");
    expect(cmdShellArgs("l.cmd", ["a\nb"], {})).toHaveProperty("error");
    expect(cmdShellArgs("l.cmd", ["%Path%"], { PATH: "C:\\Windows" })).toHaveProperty("error");
    expect(cmdShellArgs("l.cmd", ["%NOT_SET%"], { PATH: "C:\\Windows" })).not.toHaveProperty("error");
  });

  it("the real runtime closes stdin and reports a timeout as exit 124", async () => {
    const rt = defaultRuntime();
    const eof = await rt.run(process.execPath, ["-e", "process.stdin.resume().on('end', () => console.log('eof'))"], 30_000);
    expect(eof.stdout.trim()).toBe("eof");
    const slow = await rt.run(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], 300);
    expect(slow.code).toBe(124);
    expect(slow.stderr).toMatch(/timed out after \d+s/);
  });

  it.runIf(process.platform === "win32")("a real .cmd in a folder with spaces gets every argument unchanged", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "iaxi-cmd-")), "dir with space");
    mkdirSync(dir);
    writeFileSync(join(dir, "echo.js"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
    // Giống launcher thật: chuyển %* nguyên vẹn sang binary.
    writeFileSync(join(dir, "launcher.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0echo.js" %*\r\nexit /b %errorlevel%\r\n`);
    const args = ["detect", "--json", "my site/dist", "http://h/?a=1&echo INJECTED", "a|b", "c^d", "wow!", "D:\\x y\\"];
    const r = await defaultRuntime().run(join(dir, "launcher.cmd"), args, 30_000);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout.trim())).toEqual(args);
  });
});

describe("patch-skill", () => {
  const ROUTING = 'run `"<skill-base-dir>/scripts/impeccable" detect --json <scan.targets joined by spaces>` once';
  const CDP = 'Run `"<skill-base-dir>/scripts/impeccable" detect --cdp 9222 --target <part of the page URL or title> --json`. It returns the same JSON as a URL scan';
  const BLOCK = '```bash\n"<skill-base-dir>/scripts/impeccable" detect --json --scope layout [target files or dirs]\n```\n- Exit code 0 = clean; 2 = findings.\n';

  it("rewrites JSON-mode detect calls wherever --json sits", () => {
    expect(patchText("routing.md", ROUTING).text).toBe("run `impeccable-axi detect <scan.targets joined by spaces>` once");
    expect(patchText("critique.md", CDP).text).toBe(
      "Run `impeccable-axi detect --cdp 9222 --target <part of the page URL or title>`. It returns the same summary as a URL scan",
    );
    const b = patchText("layout.md", BLOCK).text;
    expect(b).toContain("impeccable-axi detect --scope layout [target files or dirs]\n");
    expect(b).toContain("impeccable-axi exits 0 whenever the scan ran");
    expect(patchText("hooks.md", 'Run `"<skill-base-dir>/scripts/impeccable" detect <path>` first').replacements).toBe(0);
    expect(patchText("two.md", `${BLOCK}\n${BLOCK}`).text).not.toContain("- Exit code 0 = clean; 2 = findings.");
  });

  it("--skill-dir is resolved against the working directory", async () => {
    const base = mkdtempSync(join(tmpdir(), "iaxi-rel-"));
    mkdirSync(join(base, "skill"));
    writeFileSync(join(base, "skill", "SKILL.md"), "---\nname: impeccable\n---\n");
    const { out, code } = await runCli(["patch-skill", "--skill-dir", "skill", "--dry-run"], fakeRuntime({ code: 0 }, { cwd: base }));
    expect(code).toBe(0);
    expect(out).toContain("would patch 1 files");
  });

  it("patches a skill folder idempotently and reverts it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iaxi-skill-"));
    mkdirSync(join(dir, "reference"));
    writeFileSync(join(dir, "SKILL.md"), "---\nname: impeccable\nversion: 4.7.0\n---\nBody\n");
    writeFileSync(join(dir, "reference", "routing.md"), `${ROUTING}\n`);
    writeFileSync(join(dir, "reference", "layout.md"), BLOCK);
    writeFileSync(join(dir, "reference", "hooks.md"), 'Run `"<skill-base-dir>/scripts/impeccable" detect <path>` first\n');
    const rt = fakeRuntime({ code: 0 }, { env: { IMPECCABLE_SKILL_DIR: dir } });

    const first = await runCli(["patch-skill"], rt);
    expect(first.code).toBe(0);
    expect(first.out).toContain("status: patched 3 files");
    expect(first.out).toContain("untouched: 1 text-mode detect calls left as they are");
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toContain("<!-- impeccable-axi:begin -->");
    expect(existsSync(join(dir, BACKUP_DIR, "reference", "routing.md"))).toBe(true);

    const again = await runCli(["patch-skill"], rt);
    expect(again.out).toContain("status: already patched (3 files)");

    const back = await runCli(["patch-skill", "--revert"], rt);
    expect(back.out).toContain("status: restored 3 files");
    expect(readFileSync(join(dir, "reference", "routing.md"), "utf8")).toBe(`${ROUTING}\n`);
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false);
  });

  it("missing skill folder ⇒ SKILL_MISSING", async () => {
    const { out, code } = await runCli(["patch-skill", "--skill-dir", join(tmpdir(), "no-such-skill-dir")], fakeRuntime({ code: 0 }));
    expect(code).toBe(1);
    expect(out).toContain("code: SKILL_MISSING");
  });
});

describe("home", () => {
  it("reports engine version from engine-probe and the unpatched skill", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iaxi-home-"));
    writeFileSync(join(dir, "SKILL.md"), "---\nname: impeccable\nversion: 4.7.0\n---\n");
    const rt = fakeRuntime({ code: 0, stdout: "impeccable-engine 0.1.16\n" }, { env: { IMPECCABLE_BIN: process.execPath, IMPECCABLE_SKILL_DIR: dir } });
    const { out, code } = await runCli([], rt);
    expect(code).toBe(0);
    expect(out).toContain('engine: "0.1.16 (env:');
    expect(out).toContain("not patched");
    expect(out).toContain("impeccable-axi patch-skill");
    expect(rt.calls[0]?.slice(1)).toEqual(["engine-probe"]);
  });

  it("names a broken IMPECCABLE_BIN in help", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iaxi-home-"));
    writeFileSync(join(dir, "SKILL.md"), "---\nname: impeccable\nversion: 4.7.0\n---\n");
    const missing = join(tmpdir(), "no-such-impeccable.exe");
    const { out } = await runCli([], fakeRuntime({ code: 0 }, { env: { IMPECCABLE_BIN: missing, IMPECCABLE_SKILL_DIR: dir } }));
    expect(out).toContain("Fix or unset IMPECCABLE_BIN");
  });

  it("tilde only replaces a whole home directory", () => {
    expect(tilde("/home/al/x", "/home/al")).toBe("~/x");
    expect(tilde("/home/al", "/home/al/")).toBe("~");
    expect(tilde("/home/alice/x", "/home/al")).toBe("/home/alice/x");
    expect(tilde("C:\\Users\\Al\\.impeccable", "C:\\Users\\Al")).toBe("~/.impeccable");
  });
});

// parseFindings chấp nhận cả dạng { findings: [...] } (phòng engine đổi vỏ JSON).
it("parseFindings accepts a wrapped object and rejects garbage", () => {
  const list: Finding[] = [{ antipattern: "x", file: "a.html" }];
  expect(parseFindings(JSON.stringify({ findings: list }))).toEqual(list);
  expect(parseFindings("not json")).toBeUndefined();
});
