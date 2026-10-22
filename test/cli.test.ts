import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { interleave, parseFindings, type Finding } from "../src/commands/detect.js";
import { BACKUP_DIR, patchText } from "../src/commands/patch.js";
import { VERSION } from "../src/version.js";
import { fakeRuntime, fixture, runCli } from "./helpers.js";

const root = join(import.meta.dirname, "..");
const FINDINGS = fixture("findings.json");

describe("contract", () => {
  it("version matches package.json and the fast path answers without loading commands", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
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
});

// parseFindings chấp nhận cả dạng { findings: [...] } (phòng engine đổi vỏ JSON).
it("parseFindings accepts a wrapped object and rejects garbage", () => {
  const list: Finding[] = [{ antipattern: "x", file: "a.html" }];
  expect(parseFindings(JSON.stringify({ findings: list }))).toEqual(list);
  expect(parseFindings("not json")).toBeUndefined();
});
