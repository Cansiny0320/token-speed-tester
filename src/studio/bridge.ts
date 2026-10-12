import type { IncomingMessage, ServerResponse } from "node:http";
import type { BenchmarkRunner } from "./runner.js";
import type { PairingInfo } from "./types.js";
import { Buffer } from "node:buffer";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { isRecord } from "./types.js";

export const DEFAULT_BRIDGE_PORT = 46321;
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
export interface BridgeOptions {
  port?: number;
  allowedOrigins: string[];
  siteUrl: string;
  approvePairing: (origin: string) => Promise<boolean>;
}
async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("请求必须使用 application/json。");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 256 * 1024) throw new Error("请求内容过大。");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function startBridge(runner: BenchmarkRunner, options: BridgeOptions) {
  const allowed = new Set(options.allowedOrigins.map(value => new URL(value).origin));
  const sessions = new Map<string, { origin: string; expiresAt: number }>();
  let code = "";
  let expiresAt = 0;
  let port = options.port ?? DEFAULT_BRIDGE_PORT;
  let attempts: number[] = [];
  let pendingApproval = false;
  let infoPromise: ReturnType<BenchmarkRunner["info"]> | undefined;
  function pairing(rotate = false): PairingInfo {
    if (rotate || Date.now() >= expiresAt) {
      code = String(randomInt(10000000, 100000000));
      expiresAt = Date.now() + 5 * 60 * 1000;
    }
    return { code, expiresAt, port, siteUrl: options.siteUrl };
  }
  pairing();
  function send(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(JSON.stringify(value));
  }
  const server = createServer((request, response) => {
    void (async () => {
      const origin = request.headers.origin;
      if (request.headers.host !== `127.0.0.1:${port}` || typeof origin !== "string" || !allowed.has(origin)) {
        send(response, 403, { error: "网站来源未获允许。请从桌面软件打开官方网站。" });
        return;
      }
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      if (request.method === "OPTIONS") {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        response.setHeader("Access-Control-Allow-Private-Network", "true");
        response.writeHead(204);
        response.end();
        return;
      }
      const route = request.url;
      if (route === "/health" && request.method === "GET") {
        send(response, 200, { service: "token-speed-studio", protocol: 1 });
        return;
      }
      if (route === "/pair" && request.method === "POST") {
        attempts = attempts.filter(at => Date.now() - at < 60000);
        if (attempts.length >= 5) {
          send(response, 429, { error: "配对尝试过于频繁，请一分钟后重试。" });
          return;
        }
        attempts.push(Date.now());
        const body = await readJson(request);
        const supplied = isRecord(body) && typeof body.code === "string" ? body.code : "";
        if (supplied.length !== code.length || Date.now() >= expiresAt || !timingSafeEqual(Buffer.from(supplied), Buffer.from(code))) {
          send(response, 401, { error: "配对码无效或已过期，请在软件中获取新配对码。" });
          return;
        }
        if (pendingApproval) {
          send(response, 409, { error: "请先处理桌面上的配对确认。" });
          return;
        }
        pendingApproval = true;
        let approved = false;
        try {
          approved = await options.approvePairing(origin);
        }
        finally {
          pendingApproval = false;
        }
        if (!approved) {
          send(response, 403, { error: "已在本机拒绝配对。" });
          return;
        }
        const token = randomBytes(32).toString("base64url");
        for (const [key, session] of sessions) {
          if (session.expiresAt <= Date.now()) sessions.delete(key);
        }
        if (sessions.size >= 8) sessions.delete(sessions.keys().next().value!);
        sessions.set(token, { origin, expiresAt: Date.now() + SESSION_LIFETIME });
        pairing(true);
        send(response, 200, { token, expiresIn: SESSION_LIFETIME / 1000 });
        return;
      }
      const header = request.headers.authorization;
      const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
      const session = sessions.get(token);
      if (!session || session.origin !== origin || session.expiresAt < Date.now()) {
        send(response, 401, { error: "连接已失效，请重新配对。" });
        return;
      }
      if (route === "/state" && request.method === "GET") {
        send(response, 200, runner.state());
      }
      else if (route === "/info" && request.method === "GET") {
        infoPromise ??= runner.info().finally(() => {
          infoPromise = undefined;
        });
        send(response, 200, await infoPromise);
      }
      else if (route === "/run" && request.method === "POST") {
        send(response, 200, runner.start(await readJson(request)));
      }
      else if (route === "/cancel" && request.method === "POST") {
        await readJson(request);
        runner.cancel();
        send(response, 200, { ok: true });
      }
      else if (route === "/disconnect" && request.method === "POST") {
        await readJson(request);
        sessions.delete(token);
        send(response, 200, { ok: true });
      }
      else {
        send(response, 404, { error: "未知的测速操作。" });
      }
    })().catch((error: unknown) => {
      if (!response.headersSent) send(response, 400, { error: error instanceof Error ? error.message : "请求失败。" });
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address && typeof address !== "string") port = address.port;
  return {
    port,
    pairing,
    async close() {
      sessions.clear();
      runner.cancel();
      await runner.settled();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
