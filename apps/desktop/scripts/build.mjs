import { spawnSync } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const directory = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(directory, "../..");
for (const [command, args] of [[process.execPath, [path.join(root, "scripts/sync-studio-web.mjs")]], [process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--dir", path.join(root, "apps/site"), "build"]]]) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir(path.join(directory, "dist"), { recursive: true });
await build({
  entryPoints: { main: path.join(directory, "src/main.ts"), preload: path.join(directory, "src/preload.ts") },
  outdir: path.join(directory, "dist"),
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  external: ["electron", "openai", "@anthropic-ai/sdk", "tiktoken"],
});
await cp(path.join(root, "apps/site/dist"), path.join(directory, "dist/web"), { recursive: true });
