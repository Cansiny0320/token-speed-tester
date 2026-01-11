import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
  ],
  format: ["esm"],
  platform: "node",
  target: "node18",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: true,
});
