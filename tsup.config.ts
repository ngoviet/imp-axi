import { defineConfig } from "tsup";

export default defineConfig({
  // "bin/imp-axi" ⇒ dist/bin/imp-axi.js (khớp "bin" trong package.json).
  // cli.ts nạp động từ bin.ts ⇒ chunk riêng, fast path `--version` không chạm tới.
  entry: { "bin/imp-axi": "src/bin.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  splitting: true,
  clean: true,
  sourcemap: false,
  dts: false,
});
