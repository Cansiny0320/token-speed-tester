import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { codexStreamTest } from "../src/studio/cli.js";
import { CodexSession } from "../src/studio/codex.js";
import { DEFAULT_BENCHMARK_CONFIG } from "../src/studio/types.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function fixture(mode = "complete") {
  const dir = await mkdtemp(path.join(tmpdir(), "studio-test-"));
  directories.push(dir);
  const script = path.join(dir, "codex.cjs");
  const trace = path.join(dir, "trace.jsonl");
  await writeFile(script, `
const fs = require('node:fs');
const lines = require('node:readline').createInterface({ input: process.stdin });
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
const notify = (method, params) => send({ method, params: { threadId: 't1', ...params } });
lines.on('line', line => {
 const q = JSON.parse(line);
 fs.appendFileSync(${JSON.stringify(trace)}, line + '\\n');
 if (!q.id) return;
 let result = {};
 if (q.method === 'initialize') result = { userAgent: 'codex-test/1.0' };
 if (q.method === 'config/read') result = { config: { model: 'configured-model', mcp_servers: { local: { command: 'never-start' } } } };
 if (q.method === 'account/read') result = { account: { type: 'chatgpt', planType: 'plus' } };
 if (q.method === 'model/list') result = { data: [{ model: 'catalogue-model', isDefault: true, supportedReasoningEfforts: [] }] };
 if (q.method === 'thread/start') result = { thread: { id: 't1' }, model: 'configured-model' };
 if (q.method === 'turn/start') {
   if (${JSON.stringify(mode)} === 'hang') return;
   if (${JSON.stringify(mode)} === 'tool') notify('item/started', { item: { type: 'commandExecution' } });
   else {
     notify('item/agentMessage/delta', { delta: 'hel' });
     notify('item/agentMessage/delta', { delta: 'lo' });
     notify('thread/tokenUsage/updated', { tokenUsage: { last: { inputTokens: 10, outputTokens: 4, reasoningOutputTokens: 3 } } });
     notify('turn/completed', { turn: { status: 'completed' } });
   }
   result = { turn: { id: 'turn1' } };
 }
 send({ id: q.id, result });
});
`);
  return { script, trace };
}

describe("isolated Codex transport", () => {
  it("handles events before the start reply and disables inherited MCPs", async () => {
    const { script, trace } = await fixture();
    const session = await CodexSession.open(script);
    try {
      expect(await session.info()).toMatchObject({ configuredModel: "configured-model", version: "codex-test/1.0", authenticated: true });
      const thread = await session.prepare(DEFAULT_BENCHMARK_CONFIG);
      let text = "";
      const result = await session.run(thread, DEFAULT_BENCHMARK_CONFIG, (delta) => {
        text += delta;
      }, new AbortController().signal);
      expect(text).toBe("hello");
      expect(result.usage).toMatchObject({ outputTokens: 4, reasoningTokens: 3 });
      const requests = (await readFile(trace, "utf8")).trim().split("\n").map(line => JSON.parse(line));
      expect(requests.find(q => q.method === "thread/start").params).toMatchObject({ ephemeral: true, sandbox: "read-only", config: { mcp_servers: { local: { enabled: false, required: false } } } });
    }
    finally { await Promise.all([session.close(), session.close()]); }
  });

  it("rejects tool calls as an invalid benchmark sample", async () => {
    const { script } = await fixture("tool");
    const session = await CodexSession.open(script);
    try {
      const thread = await session.prepare(DEFAULT_BENCHMARK_CONFIG);
      await expect(session.run(thread, DEFAULT_BENCHMARK_CONFIG, () => {}, new AbortController().signal)).rejects.toThrow("工具");
    }
    finally { await session.close(); }
  });

  it("uses the real CLI adapter without API credentials and counts visible usage", async () => {
    const { script } = await fixture();
    const config = parseConfig({ provider: "codex", apiKey: "", codexPath: script });
    const result = await codexStreamTest(config, { quiet: true });
    expect(result.totalTokens).toBe(1);
    expect(result.tokens).toHaveLength(1);
    expect(config.model).toBe("configured-model");
  });

  it("cancels while turn/start has not replied", async () => {
    const { script } = await fixture("hang");
    const abort = new AbortController();
    const result = codexStreamTest(parseConfig({ provider: "codex", apiKey: "", codexPath: script }), { quiet: true, signal: abort.signal });
    const assertion = expect(result).rejects.toThrow("cancelled");
    setTimeout(() => abort.abort(), 150);
    await assertion;
  });
});
