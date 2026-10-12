import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = path.join(root, "apps/site");
await mkdir(path.join(site, "src"), { recursive: true });
await copyFile(path.join(root, "src/studio/types.ts"), path.join(site, "src/protocol.ts"));
const hosting = JSON.parse(await readFile(path.join(site, ".openai/hosting.json"), "utf8"));
if (!hosting.project_id) throw new Error("Sites project_id is required before building the public client.");
await writeFile(path.join(site, "src/site-info.json"), JSON.stringify({
  siteUrl: "https://token-speed-studio.cansiny0320.chatgpt.site",
  sourceUrl: "https://github.com/Cansiny0320/token-speed-tester",
}, null, 2) + "\n");
