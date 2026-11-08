# imp-axi

<!-- readme-axi type=tool -->

[![CI](https://github.com/ngoviet/imp-axi/actions/workflows/ci.yml/badge.svg)](https://github.com/ngoviet/imp-axi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ngoviet/imp-axi)](https://github.com/ngoviet/imp-axi/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) · **Tiếng Việt**

Một [AXI](https://axi.md) cho bộ dò thiết kế của [Impeccable](https://github.com/pbakaus/impeccable): CLI để coding
agent (Claude Code, Codex, OpenCode, …) gọi qua shell nhằm quét lỗi giao diện của một trang web, rồi nhận bản tóm
tắt [TOON](https://toonformat.dev/) gọn trong một màn hình thay vì hàng trăm KB JSON.

> 🇻🇳 Dự án do một người Việt tự xây dựng và duy trì — nếu nó giúp ích cho bạn, hãy
> [ủng hộ dự án](#ủng-hộ-dự-án).

## Mục lục

- [Tính năng](#tính-năng)
- [Cài đặt](#cài-đặt)
- [Cách dùng](#cách-dùng)
- [Lệnh](#lệnh)
- [Cách hoạt động](#cách-hoạt-động)
- [Tích hợp với agent](#tích-hợp-với-agent)
- [Phát triển](#phát-triển)

## Tính năng

- **Gọn trong một màn hình.** `impeccable detect --json` lặp lại nguyên mô tả của luật ở mọi phát hiện, còn công cụ
  shell của agent cắt output sau khoảng 30K ký tự. imp-axi in cách sửa của mỗi luật **một lần** trong bảng
  `rules[]`, rồi đến số lượng theo từng file và một mẫu các phát hiện. Đo trên bản build Vite/React 35 trang (engine
  0.1.19, 606 phát hiện):

  | Output | Kích thước | So với gốc |
  | --- | ---: | ---: |
  | `impeccable detect --json` | 424 KB | 1× |
  | `imp-axi detect` (mặc định) | 5,5 KB | ÷78 |
  | `imp-axi detect --full` (mọi phát hiện) | 80 KB | ÷5 |

- **Trang đầu có đủ mọi luật.** Phát hiện được xếp xen kẽ giữa các luật (mỗi luật một dòng, rồi vòng tiếp theo, …),
  nên 20 dòng đầu cho thấy mọi loại lỗi chứ không phải 20 bản sao của loại hay gặp nhất.
- **Trạng thái trung thực.** Số tổng đứng đầu (`primary`, `advisory`, số file). Đích không đọc được cho ra
  `status: incomplete`, không bao giờ `clean`. Chỉ quét mã component thì có ghi chú `coverage`, vì khi đó bộ dò
  chỉ chạy các luật regex.
- **Mã thoát hợp với agent.** Engine thoát mã 2 khi tìm thấy lỗi; imp-axi thoát 0 mỗi khi quét chạy xong, để agent
  không nhầm một lần quét thành công là thất bại. Mọi màn hình đều kết thúc bằng `help[]`, lệnh nên chạy tiếp.
- **Chỉ đọc**, trừ `patch-skill`, lệnh này luôn sao lưu trước khi ghi.

## Cài đặt

Yêu cầu:

- **Node.js ≥ 20**
- **Skill Impeccable** (ví dụ `npx impeccable install --providers=claude`, hoặc plugin Claude Code). imp-axi không
  kèm bộ dò; nó chạy đúng engine mà skill đang dùng.

Từ bản phát hành mới nhất (không cần clone):

```bash
npm install -g https://github.com/ngoviet/imp-axi/releases/download/v0.1.0/imp-axi-0.1.0.tgz
```

Từ mã nguồn:

```bash
git clone https://github.com/ngoviet/imp-axi.git
cd imp-axi
npm ci
npm run install:global   # build, đóng gói rồi cài gói vừa đóng ra toàn cục
```

imp-axi không đăng lên npm registry.

## Cách dùng

```bash
imp-axi                      # phiên bản engine, phiên bản skill và trạng thái vá, PRODUCT.md / DESIGN.md
imp-axi detect dist          # quét thư mục build
imp-axi detect http://localhost:5173 --viewport 390x844   # quét dev server đang chạy
imp-axi rules                # mỗi luật bắt lỗi gì, không cần quét
imp-axi patch-skill          # cho skill Impeccable gọi imp-axi (hoàn tác: --revert)
```

Ví dụ (rút gọn bằng `…`; bản thật in đủ mọi dòng luật):

```text
$ imp-axi detect dist --limit 4
target: "dist"
status: "606 findings (576 primary, 30 advisory) in 35 files"
rules[13]{rule,category,primary,advisory,why}:
  cramped-padding,quality,271,0,"Text is too close to the edge of its container. … (+294 chars)"
  undersized-ui-text,quality,98,0,"Interactive and content-bearing UI text … below 11px is a legibility f… (+656 chars)"
  low-contrast,quality,86,13,"Text does not meet WCAG AA contrast requirements (4.5:1 for body, 3:1 for large text). …"
  gradient-text,slop,25,0,"Gradient text is decorative rather than meaningful — a common AI tell. Use solid colors for text."
  …
files: "dist/equipment.html 71, dist/blog.html 65, dist/faq.html 56, … (+25 more files)"
count: 4 of 606 total
findings[4]{file,line,rule,snippet}:
  "dist/about.html","",cramped-padding,"<div> \"bg-night-800\": children flush against bg on all sides (no inset)"
  "dist/blog.html","",undersized-ui-text,"9px functional text \"#chi phí\" (below 11px floor)"
  "dist/about.html","",low-contrast,"2.0:1 (need 4.5:1) — text #38bdf8 on #f8fafc"
  "dist/about.html","",gradient-text,"background-clip: text + gradient"
help[4]: "Run `imp-axi detect dist --rule cramped-padding` to list one rule","Run `imp-axi detect dist --file dist/equipment.html` to list one file","Run `imp-axi detect dist --full` to list all 606","After fixing, rerun the same command to confirm the counts dropped"
```

Mô tả dài bị cắt kèm dấu `(+N chars)`; `--full` hoặc `imp-axi rules <id>` cho nguyên văn. Cột `line` trống nghĩa là
luật áp lên phần tử đã render, không phải một dòng mã nguồn.

## Lệnh

| Lệnh | Việc làm |
| --- | --- |
| `imp-axi` / `imp-axi home` | Phiên bản engine và nơi tìm thấy, phiên bản skill và trạng thái vá, dự án này có `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json` không. |
| `imp-axi detect <file\|dir\|url>...` | Chạy bộ dò và tóm tắt theo luật, theo file. |
| `imp-axi rules [id...]` | Danh mục luật, không cần quét (engine ≥ 0.1.17). Ghi id thì in mô tả đầy đủ của luật đó. |
| `imp-axi patch-skill` | Sửa các lệnh `detect --json` trong skill thành `imp-axi detect`, có sao lưu. |

### Cờ

Lệnh nào cũng nhận:

| Cờ | Ý nghĩa |
| --- | --- |
| `--fields a,b` | Chỉ các cột này (`detect`: mặc định `file,line,rule,snippet`; thêm được `severity,category,advisory,path`). |
| `--limit <n>` | Số dòng hiện (mặc định 20). |
| `--full` | Mọi dòng, không cắt chữ. |
| `--help` | Trợ giúp của lệnh. |

`detect` có thêm `--rule <id,id>` (chỉ các luật này), `--file <text>` (chỉ đường dẫn chứa chuỗi này) và
`--sort rule|file` (`rule`, mặc định, xếp xen kẽ luật; `file` xếp theo file và dòng). Cờ của engine được chuyển
nguyên: `--scope`, `--viewport <WxH>`, `--cdp <port|url>`, `--target <text>`, `--no-advisory`, `--no-config`,
`--no-design-system`, `--no-inline-ignores`, `--no-consent-hiding`, `--no-overlay-hiding`.

`rules` có thêm `--grep <text>` (id, tên hoặc mô tả chứa chuỗi này) và `--category <c,c>` (`quality`, `slop`);
`--fields` mặc định `id,category,severity,description` (thêm được `name,scopes,advisory`).

### Mã thoát

| Mã | Ý nghĩa |
| --- | --- |
| `0` | Lệnh đã chạy. Với `detect` là cả khi quét **có** phát hiện và khi có đích không đọc được: xem `status` (`clean`, một con số, hoặc `incomplete` kèm dòng `attention`). |
| `1` | Không có engine hoặc quét hỏng hẳn. |
| `2` | Sai cách gọi (lệnh hay cờ lạ, thiếu đối số). |

Lỗi được in dạng TOON gồm `error`, `code` và `help[]`.

## Cách hoạt động

### Tìm engine

Theo thứ tự, cái nào có trước thì dùng:

1. Biến môi trường `IMPECCABLE_BIN`.
2. Binary đi kèm skill: `<skill>/scripts/bin/<os>-<arch>/`.
3. Bộ đệm tải về của launcher: `~/.impeccable/bin/<scripts/VERSION của skill>/`.
4. Script launcher của skill. imp-axi chạy nó một lần với `engine-probe` để tải binary, rồi gọi thẳng binary để đối
   số quét không bị shell phân tích lại.

Thư mục skill là `IMPECCABLE_SKILL_DIR` nếu có đặt, không thì `~/.claude/skills/impeccable`.

Trên Windows, launcher là tệp `.cmd` nên bắt buộc chạy qua `cmd.exe`. imp-axi tự bọc nháy mọi đối số và từ chối đối
số chứa `"`, xuống dòng hoặc `%BIẾN%`, nên đường dẫn có dấu cách và URL có `&` vẫn an toàn.

### Phạm vi quét

Bộ dò có hai loại luật:

- **Luật regex** chạy trên tệp mã và style (`.css .scss .js .ts .jsx .tsx .vue .svelte .astro`, thêm `.mjs .cjs`
  từ engine 0.1.19).
- **Luật cần render** (độ tương phản, khoảng đệm, cỡ chữ, lồng thẻ…) cần một trang: `.html` đã build hoặc URL.

`detect --json` không cho biết loại nào đã chạy, nên imp-axi tự suy từ đích quét và thêm ghi chú `coverage` khi bạn
quét mã component (`.jsx/.tsx/.vue/.svelte/.astro`) mà không có HTML. Muốn chạy đủ luật, hãy quét bản build hoặc URL
của dev server.

## Tích hợp với agent

Skill Impeccable bảo agent chạy `<engine> detect --json`. `imp-axi patch-skill` sửa các lệnh đó thành
`imp-axi detect`, để agent mặc định nhận bản gọn.

- **Chạy lại không sao:** chạy lần thứ hai không đổi gì thêm.
- **Hoàn tác được:** bản gốc được chép vào `<skill>/.imp-axi-backup/`; `imp-axi patch-skill --revert` trả lại.
  `--dry-run` cho xem sẽ đổi gì; `--skill-dir <path>` chọn thư mục skill khác.
- **Nhận cả hai dạng skill:** `"<skill-base-dir>/scripts/impeccable"` (plugin ≤ 4.7.0) và
  `.claude/skills/impeccable/scripts/impeccable` (`npx impeccable install` 4.8.x).

Cập nhật hay cài lại skill sẽ ghi đè các tệp đã vá (và `npx impeccable install` xoá thư mục sao lưu), nên sau đó hãy
chạy lại `imp-axi patch-skill`.

Nội dung quét được (snippet, chữ trên trang) là dữ liệu, không phải chỉ dẫn: imp-axi chỉ in ra, không làm theo.

> Tên cũ là `impeccable-axi`. Nếu skill đã vá bằng tên cũ, chạy `impeccable-axi patch-skill --revert` trước khi
> `npm uninstall -g impeccable-axi`, rồi chạy `imp-axi patch-skill`.

## Phát triển

```bash
npm ci
npm run check     # typecheck + eslint + vitest
npm run build     # dist/ bằng tsup
```

- `src/registry.ts` là nguồn duy nhất cho bảng lệnh và `--help`.
- Mọi truy cập môi trường, tệp và tiến trình đi qua `src/runtime.ts`, nên test dùng runtime giả và không bao giờ chạy
  engine thật. Fixture trong `test/fixtures/` cùng dạng với output của engine.
- Khi đổi phiên bản, sửa cả `package.json` và `src/version.ts` (có test kiểm hai chỗ khớp nhau).
- Thay đổi theo từng phiên bản: [CHANGELOG.md](CHANGELOG.md) và [Releases](https://github.com/ngoviet/imp-axi/releases).

<!-- support:start -->
## Ủng hộ dự án

<p align="center">
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/banner.svg" width="720" alt="Built and maintained by one person in Việt Nam">
</p>

<p align="center">
  <a href="https://buymeacoffee.com/ngoviet"><img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/btn-coffee.svg" height="56" alt="Buy me a coffee"></a>
  &nbsp;
  <a href="https://github.com/sponsors/ngoviet"><img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/btn-sponsors.svg" height="56" alt="GitHub Sponsors"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/vietqr-card.svg" width="300" alt="VietQR — MB Bank — NGO DUC VIET — 911051212">
  &nbsp;
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/crypto-card.svg" width="300" alt="Crypto — BNB Smart Chain (BEP20) — 0xcbf0402b232cb24b4d998f09a4884f87b5f74750">
</p>

<p align="center"><b>Ví tiền mã hoá, chỉ gửi qua mạng BNB Smart Chain (BEP20):</b><br><code>0xcbf0402b232cb24b4d998f09a4884f87b5f74750</code></p>

<p align="center"><sub>🇻🇳 VietQR: quét bằng app ngân hàng bất kỳ, nội dung <code>Ung ho imp-axi</code>. Cảm ơn bạn đã giúp dự án tiếp tục phát triển!</sub></p>
<!-- support:end -->

## Giấy phép

[MIT](LICENSE) © Ngô Đức Việt. Không liên kết hay được dự án Impeccable bảo trợ; imp-axi chỉ gọi bộ dò của nó.
