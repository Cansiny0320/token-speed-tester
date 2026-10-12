import type { AddressInfo } from "node:net";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const loader = createRequire(import.meta.url).resolve("tsx");
let directory: string;
let requests: Record<string, unknown>[];
let failRequest: boolean;
let endpoint: string;
const server = createServer(async (req, res) => {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(Buffer.from(part));
  requests.push(JSON.parse(Buffer.concat(parts).toString()));
  if (failRequest) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "fixture rejection", type: "invalid_request_error" } }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  if (req.url === "/v1/messages") {
    const events = [
      { type: "message_start", message: { id: "fixture", type: "message", role: "assistant", content: [], model: "claude-test", usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ];
    for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();
    return;
  }
  for (const content of ["hel", "lo"]) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  }
  res.end("data: [DONE]\n\n");
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "token-speed-cli-"));
  requests = [];
  failRequest = false;
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

function cli(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", loader, entry, "--api-key", "local-test-key", "--url", endpoint, "--runs", "1", "--lang", "en", ...args], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

describe("real CLI with a local streaming API", () => {
  it("writes a JSON report and sends the default model's token limit", async () => {
    const result = await cli(["--output-format", "json", "--output", "result.json", "--runs", "2"]);
    expect(result.code, result.stderr).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ model: "gpt-5.2", max_completion_tokens: 1024, stream: true });
    expect(requests[0]).not.toHaveProperty("max_tokens");
    const report = JSON.parse(await readFile(join(directory, "result.json"), "utf-8"));
    expect(report.runs).toHaveLength(2);
    expect(report.runs[0].totalTokens).toBe(1);
    expect(report.runs[0].tps.reduce((sum: number, n: number) => sum + n, 0)).toBe(1);
    expect(report.config).not.toHaveProperty("apiKey");
  }, 30000);

  it("writes CSV and retains legacy model request parameters", async () => {
    const result = await cli(["-m", "gpt-4", "-f", "csv", "-o", "result.csv"]);
    expect(result.code, result.stderr).toBe(0);
    expect(requests[0]).toHaveProperty("max_tokens", 1024);
    const report = await readFile(join(directory, "result.csv"), "utf-8");
    expect(report).toContain("# Individual Runs");
    expect(report).toContain("# Model: gpt-4");
  }, 30000);

  it("reads Anthropic usage through the real SDK", async () => {
    const result = await cli(["-p", "anthropic", "--url", endpoint.replace(/\/v1$/, ""), "-m", "claude-test", "-f", "json", "-o", "anthropic.json"]);
    expect(result.code, result.stderr).toBe(0);
    expect(requests[0]).toMatchObject({ model: "claude-test", max_tokens: 1024 });
    const report = JSON.parse(await readFile(join(directory, "anthropic.json"), "utf-8"));
    expect(report.runs[0].totalTokens).toBe(7);
    expect(report.runs[0].tps.reduce((sum: number, n: number) => sum + n, 0)).toBe(1);
  }, 30000);

  it("renders terminal output", async () => {
    const result = await cli(["-f", "terminal"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("hello");
    expect(result.stdout).toContain("TTFT");
  }, 30000);

  it.each([
    ["--runs", "1.5"],
    ["--runs", "2abc"],
    ["--max-tokens", "3.5"],
    ["--prompt", "   "],
    ["--output", "   "],
    ["--api-key", ""],
  ])("rejects invalid %s %s before sending a request", async (flag, value) => {
    const result = await cli(["-f", "json", flag, value]);
    expect(result.code).toBe(1);
    expect(result.stderr.trim()).not.toBe("");
    expect(requests).toHaveLength(0);
  }, 30000);

  it("exits unsuccessfully on an API rejection", async () => {
    failRequest = true;
    const result = await cli(["-f", "json"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("fixture rejection");
  }, 30000);
});
