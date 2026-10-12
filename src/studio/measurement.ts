import type { RunMeasurement, TokenUsage } from "./types.js";
import { Buffer } from "node:buffer";
import { calculateTPS } from "../metrics.js";
import { createTokenizer } from "../tokenizer.js";

const MAX_OUTPUT_CHARACTERS = 300000;
/** Receive timestamps are captured before rendering or tokenization. */
export class Measurement {
  private chunks: { text: string; elapsedMs: number; byteEnd: number }[] = [];
  private text = "";
  private byteLength = 0;
  private encoding;
  tokenTimes: number[] = [];
  constructor(model: string) {
    this.encoding = createTokenizer(model);
  }

  add(text: string, elapsedMs: number): void {
    if (!text) return;
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
      this.tokenTimes = times;
      return this.result(elapsedMs, times, usage);
    }
    finally {
      this.encoding.free();
    }
  }

  private result(elapsedMs: number, times: number[], usage?: TokenUsage): RunMeasurement {
    const ttftMs = this.chunks[0]?.elapsedMs ?? null;
    const duration = this.chunks.length > 1
      ? this.chunks[this.chunks.length - 1].elapsedMs - this.chunks[0].elapsedMs
      : 0;
    const reported = usage?.outputTokens;
    const outputTokens = reported === undefined
      ? times.length
      : Math.max(0, reported - (usage?.reasoningTokens ?? 0));
    const tps = calculateTPS({ ttft: ttftMs ?? 0, tokens: times, totalTokens: times.length, totalTime: elapsedMs });
    return {
      text: this.text,
      ttftMs,
      elapsedMs,
      estimatedTokens: times.length,
      outputTokens,
      tokenSource: reported === undefined ? "estimated" : "provider",
      averageTps: elapsedMs > 0 ? outputTokens / elapsedMs * 1000 : 0,
      generationTps: duration > 0 && times.length > 1 ? (times.length - 1) / duration * 1000 : null,
      peakTps: tps.length ? Math.max(...tps) : 0,
      tps,
      ...(usage ? { usage } : {}),
    };
  }
}
