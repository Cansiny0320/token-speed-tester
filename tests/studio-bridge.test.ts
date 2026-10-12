import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startBridge } from "../src/studio/bridge.js";
import { HistoryAnalyzer } from "../src/studio/history.js";
import { BenchmarkRunner } from "../src/studio/runner.js";

const origin = "https://studio.example";
let bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
const historyDirectories: string[] = [];
afterEach(async () => {
  await bridge?.close();

  bridge = undefined;
  await Promise.all(historyDirectories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function open(approve = true, history?: HistoryAnalyzer) {
  const confirm = vi.fn(async () => approve);

  bridge = await startBridge(new BenchmarkRunner(), { port: 0, siteUrl: origin, allowedOrigins: [origin], approvePairing: confirm }, history);

  const base = `http://127.0.0.1:${bridge.port}`;

  return { confirm, request: (route: string, options: RequestInit = {}) => fetch(`${base}${route}`, {
    ...options,
    headers: { "Origin": origin, "Content-Type": "application/json", ...options.headers },
  }) };
}

describe("local bridge authorization", () => {
  it("protects history behind pairing and exposes only metrics from real files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "history-bridge-"));
    historyDirectories.push(dir);
    await mkdir(path.join(dir, "sessions"));
    await writeFile(path.join(dir, "sessions", "history.jsonl"), [
      { type: "session_meta", timestamp: "2026-10-12T00:00:00Z", payload: { id: "session-test", base_instructions: "SECRET" } },
      { type: "event_msg", timestamp: "2026-10-12T00:00:01Z", payload: { type: "task_complete", turn_id: "turn-test", duration_ms: 1000, time_to_first_token_ms: 100, last_agent_message: "SECRET" } },
    ].map(x => JSON.stringify(x)).join("\n"));
    const history = new HistoryAnalyzer(dir);
    const { request } = await open(true, history);
    expect((await request("/history/state")).status).toBe(401);
    expect((await request("/history/start", { method: "POST", body: "{}" })).status).toBe(401);
    const paired = await request("/pair", { method: "POST", body: JSON.stringify({ code: bridge!.pairing().code }) });
    const { token } = await paired.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}` };
    expect((await request("/history/state", { headers: { ...headers, Origin: "https://evil.example" } })).status).toBe(403);
    expect((await request("/history/start", { method: "POST", headers, body: "{}" })).status).toBe(400);
    const started = await request("/history/start", { method: "POST", headers, body: JSON.stringify({ from: "2026-10-12", to: "2026-10-13" }) });
    expect(started.status).toBe(200);
    await history.settled();
    const result = await request("/history/state", { headers });
    const body = await result.text();
    expect(body).toContain("turn-test");
    expect(body).not.toMatch(/SECRET|base_instructions|last_agent_message/);
    expect((await request("/history/cancel", { method: "POST", headers, body: "{}" })).status).toBe(200);
  });

  it("requires the exact Site origin and a valid session for state", async () => {
    const { request } = await open();

    expect((await request("/health", { headers: { Origin: "https://evil.example" } })).status).toBe(403);

    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(`http://127.0.0.1:${bridge!.port}/health`, { headers: { Origin: origin, Host: "evil.example" } }, (res) => {
        res.resume();

        resolve(res.statusCode);
      });

      req.on("error", reject);

      req.end();
    });

    expect(badHostStatus).toBe(403);

    expect((await request("/state")).status).toBe(401);

    const health = await request("/health");

    expect(health.headers.get("Access-Control-Allow-Origin")).toBe(origin);

    expect(await health.json()).not.toHaveProperty("code");
  });

  it("requires both a pairing code and local approval, then revokes the token", async () => {
    const { request, confirm } = await open();

    const code = bridge!.pairing().code;

    expect((await request("/pair", { method: "POST", body: JSON.stringify({ code: "00000000" }) })).status).toBe(401);

    expect(confirm).not.toHaveBeenCalled();

    const paired = await request("/pair", { method: "POST", body: JSON.stringify({ code }) });

    const { token } = await paired.json() as { token: string };

    expect(confirm).toHaveBeenCalledWith(origin);

    expect(bridge!.pairing().code).not.toBe(code);

    expect((await request("/state", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);

    await request("/disconnect", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "{}" });

    expect((await request("/state", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it("does not issue a token when the user denies pairing", async () => {
    const { request } = await open(false);

    const result = await request("/pair", { method: "POST", body: JSON.stringify({ code: bridge!.pairing().code }) });

    expect(result.status).toBe(403);

    expect(await result.json()).not.toHaveProperty("token");
  });

  it("rejects simple form requests and rate-limits incorrect pairing attempts", async () => {
    const { request } = await open();

    expect((await request("/pair", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).status).toBe(400);

    for (let i = 0; i < 4; i++) await request("/pair", { method: "POST", body: "{}" });

    expect((await request("/pair", { method: "POST", body: "{}" })).status).toBe(429);
  });
});
