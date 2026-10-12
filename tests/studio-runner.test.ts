import type { Server } from "node:http";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { BenchmarkRunner } from "../src/studio/runner.js";
import { DEFAULT_BENCHMARK_CONFIG } from "../src/studio/types.js";

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();

  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
});

async function api(slow = false) {
  server = createServer((req, res) => {
    req.resume();

    res.writeHead(200, { "Content-Type": "text/event-stream" });

    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hel" } }] })}\n\n`);

    if (slow) return;

    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`);

    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 7 } } })}\n\n`);

    res.end("data: [DONE]\n\n");
  });

  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  if (!address || typeof address === "string") throw new Error("No port");

  return { ...DEFAULT_BENCHMARK_CONFIG, provider: "openai", model: "gpt-4", runs: 2, apiKey: "private-test-key", baseURL: `http://127.0.0.1:${address.port}/v1` };
}

describe("benchmark lifecycle", () => {
  it("runs sequential samples against a real SDK stream, excluding credentials", async () => {
    const runner = new BenchmarkRunner();

    const config = await api();

    runner.start(config);

    expect(() => runner.start(config)).toThrow(/正在进行/);

    const result = await runner.settled();

    expect(result.phase).toBe("completed");

    expect(result.runs).toHaveLength(2);

    expect(result.runs[0].text).toBe("hello");

    expect(result.runs[0].outputTokens).toBe(1);

    expect(result.runs[0].estimatedTokens).toBe(1);

    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });

  it("cancels the SDK request, keeps partial data and does not start another round", async () => {
    const runner = new BenchmarkRunner();

    runner.start(await api(true));

    await new Promise<void>(resolve => setTimeout(resolve, 100));

    runner.cancel();

    const result = await runner.settled();

    expect(result.phase).toBe("cancelled");

    expect(result.runs).toHaveLength(1);

    expect(result.runs[0].status).toBe("cancelled");
  });
});
