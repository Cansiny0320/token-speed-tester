import type { Readable, Writable } from "node:stream";
import { isRecord } from "./types.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
/** One stdio connection owned by this benchmark, never an existing Codex session. */
export class RpcConnection {
  private sequence = 0;
  private buffer = "";
  private closed = false;
  private pending = new Map<number, PendingRequest>();
  onNotification?: (method: string, params: unknown) => void;
  onClose?: (error: Error) => void;
  constructor(input: Readable, private output: Writable) {
    input.setEncoding("utf8");
    input.on("data", (chunk: string) => this.receive(chunk));
    input.on("end", () => this.close(new Error("Codex 连接已关闭。")));
    input.on("error", error => this.close(error));
    output.on("error", error => this.close(error));
  }

  request(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Codex 连接已关闭。"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} 超时。`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send({ method, ...(params === undefined ? {} : { params }) });
  }

  close(error = new Error("Codex 连接已关闭。")): void {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.onClose?.(error);
  }

  private send(message: unknown): void {
    if (!this.closed) this.output.write(`${JSON.stringify(message)}\n`);
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 4 * 1024 * 1024) {
      this.close(new Error("Codex 协议消息过大。"));
      return;
    }

    while (true) {
      const end = this.buffer.indexOf("\n");
      if (end === -1) break;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const message: unknown = JSON.parse(line);
        if (!isRecord(message)) throw new Error("无效的 Codex 消息。");
        if (typeof message.method === "string") {
          if (message.id !== undefined) {
            this.send(message.method.endsWith("requestApproval")
              ? { id: message.id, result: { decision: "cancel" } }
              : { id: message.id, error: { code: -32601, message: "Interactive tools are disabled for benchmarks" } });
          }
          this.onNotification?.(message.method, message.params);
        }
        else if (typeof message.id === "number") {
          const request = this.pending.get(message.id);
          if (!request) continue;
          this.pending.delete(message.id);
          clearTimeout(request.timer);
          if (isRecord(message.error)) {
            request.reject(new Error(typeof message.error.message === "string" ? message.error.message : "Codex 请求失败。"));
          }
          else {
            request.resolve(message.result);
          }
        }
      }
      catch (error) {
        this.close(error instanceof Error ? error : new Error("无法解析 Codex 协议。"));
        return;
      }
    }
  }
}
