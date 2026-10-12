import type { RunMeasurement, TokenUsage } from "./types.js";
import { Buffer } from "node:buffer";
import { calculateTPS } from "../metrics.js";
import { createTokenizerWithInfo } from "../tokenizer.js";

const MAX_OUTPUT_CHARACTERS = 300000;
/** Receive timestamps are captured before rendering or tokenization. */
export class Measurement {
  private chunks: { text: string; elapsedMs: number; byteEnd: number }[] = [];
  private text = "";
  private byteLength = 0;
  private encoding;
  private tokenizer;
  private streamed = true;
  tokenTimes: number[] = [];
  constructor(model: string) {
    const tokenizer = createTokenizerWithInfo(model);
    this.encoding = tokenizer.encoding;
    this.tokenizer = tokenizer.info;
  }

  add(text: string, elapsedMs: number, streamed = true): void {
    if (!text) return;
    this.streamed &&= streamed;
    if (this.text.length + text.length > MAX_OUTPUT_CHARACTERS) {
      throw new Error("输出超过 300000 个字符，已停止该轮测速。");
    }
    this.text += text;
    this.byteLength += Buffer.byteLength(text);
    this.chunks.push({ text, elapsedMs, byteEnd: this.byteLength });
  }

  /** During streaming, use a cheap byte estimate; finalization performs BPE once. */
  preview(elapsedMs: number): RunMeasurement {
    const tokens = this.chunks.flatMap(chunk => Array.from(
      { length: Math.ceil(Buffer.byteLength(chunk.text) / 4) },
      () => chunk.elapsedMs,
    ));
    return this.result(elapsedMs, tokens);
  }

  finish(elapsedMs: number, usage?: TokenUsage): RunMeasurement {
    try {
      const encoded = this.encoding.encode(this.text, [], []);
      let bytes = 0;
      let index = 0;
      const times: number[] = [];
      for (const token of encoded) {
        bytes += this.encoding.decode_single_token_bytes(token).length;
        while (index < this.chunks.length - 1 && this.chunks[index].byteEnd < bytes) index++;
        times.push(this.chunks[index]?.elapsedMs ?? 0);
      }
      this.tokenTimes = this.streamed ? times : [];
      return this.result(elapsedMs, times, usage);
    }
    finally {
      this.encoding.free();
    }
  }

  private result(elapsedMs: number, times: number[], usage?: TokenUsage): RunMeasurement {
    const ttftMs = this.streamed ? this.chunks[0]?.elapsedMs ?? null : null;
    const duration = this.chunks.length > 1
      ? this.chunks[this.chunks.length - 1].elapsedMs - this.chunks[0].elapsedMs
      : 0;
    const reported = usage?.outputTokens;
    const outputTokens = reported === undefined
      ? times.length
      : Math.max(0, reported - (usage?.reasoningTokens ?? 0));
    const tps = this.streamed ? calculateTPS({ ttft: ttftMs ?? 0, tokens: times, totalTokens: times.length, totalTime: elapsedMs }) : [];
    // Multiple tokens (or notifications) can arrive in the first batch. Only later
    // arrivals belong to the interval whose left boundary is that batch's arrival.
    const laterTokens = ttftMs === null ? 0 : times.filter(time => time > ttftMs).length;
    return {
      text: this.text,
      ttftMs,
      elapsedMs,
      estimatedTokens: times.length,
      outputTokens,
      tokenSource: reported === undefined ? "estimated" : "provider",
      averageTps: elapsedMs > 0 ? outputTokens / elapsedMs * 1000 : 0,
      generationTps: ttftMs !== null && duration > 0 && laterTokens > 0 ? laterTokens / duration * 1000 : null,
      peakTps: tps.length ? Math.max(...tps) : null,
      tps,
      tokenizer: this.tokenizer,
      timingSource: ttftMs === null ? "unavailable" : "stream",
      ...(usage ? { usage } : {}),
    };
  }
}
