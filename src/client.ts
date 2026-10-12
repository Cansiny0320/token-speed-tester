import type { Config } from "./config.js";
import type { StreamMetrics } from "./metrics.js";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getMessages } from "./i18n.js";
import { createTokenizer } from "./tokenizer.js";

interface StreamEvent {
  text?: string;
  outputTokens?: number;
}

interface StreamProcessor {
  stream: () => AsyncIterable<StreamEvent>;
  providerName: string;
}

class AnthropicStreamProcessor implements StreamProcessor {
  providerName = "Anthropic" as const;

  constructor(
    private client: Anthropic,
    private config: Config,
  ) {}

  async* stream(): AsyncIterable<StreamEvent> {
    const stream = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: [{ role: "user", content: this.config.prompt }],
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "message_delta") {
        yield { outputTokens: event.usage.output_tokens };
      }
      if (
        event.type === "content_block_delta"
        && event.delta.type === "text_delta"
        && event.delta.text
      ) {
        yield { text: event.delta.text };
      }
    }
  }
}

class OpenAIStreamProcessor implements StreamProcessor {
  providerName = "OpenAI" as const;

  constructor(
    private client: OpenAI,
    private config: Config,
  ) {}

  async* stream(): AsyncIterable<StreamEvent> {
    // Keep legacy parameters for older models and compatible providers.
    const modernTokenLimit = /^(?:gpt-[5-9](?:[.-]|$)|o[1-9](?:[.-]|$))/.test(this.config.model);
    const officialEndpoint = new URL(this.client.baseURL).hostname === "api.openai.com";
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      ...(modernTokenLimit
        ? { max_completion_tokens: this.config.maxTokens }
        : { max_tokens: this.config.maxTokens }),
      ...(officialEndpoint ? { stream_options: { include_usage: true } } : {}),
      messages: [{ role: "user", content: this.config.prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.usage) {
        yield {
          outputTokens: chunk.usage.completion_tokens
            - (chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0),
        };
      }
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { text: delta.content };
      }
    }
  }
}

async function runStreamTest(
  processor: StreamProcessor,
  encoding: ReturnType<typeof createTokenizer>,
): Promise<StreamMetrics> {
  const chunks: { text: string; time: number; byteEnd: number }[] = [];
  let outputTokens: number | undefined;
  let byteLength = 0;
  const startTime = performance.now();

  try {
    for await (const event of processor.stream()) {
      const elapsed = performance.now() - startTime;
      if (event.outputTokens !== undefined) {
        outputTokens = event.outputTokens;
      }
      if (event.text) {
        byteLength += Buffer.byteLength(event.text);
        chunks.push({ text: event.text, time: elapsed, byteEnd: byteLength });
        process.stdout.write(event.text);
      }
    }
    const totalTime = performance.now() - startTime;

    // Encode once after timing ends: BPE tokens can span multiple stream chunks.
    const encoded = encoding.encode(chunks.map(chunk => chunk.text).join(""), [], []);
    const tokenTimes: number[] = [];
    let tokenByteEnd = 0;
    let chunkIndex = 0;
    for (const token of encoded) {
      tokenByteEnd += encoding.decode_single_token_bytes(token).length;
      while (chunkIndex < chunks.length - 1 && chunks[chunkIndex].byteEnd < tokenByteEnd) {
        chunkIndex++;
      }
      tokenTimes.push(chunks[chunkIndex].time);
    }

    return {
      ttft: chunks[0]?.time ?? 0,
      tokens: tokenTimes,
      totalTokens: outputTokens ?? encoded.length,
      totalTime,
    };
  }
  catch (error) {
    if (error instanceof Error) {
      throw new Error(`${processor.providerName} API error: ${error.message}`);
    }
    throw error;
  }
  finally {
    encoding.free();
    if (chunks.length > 0) {
      process.stdout.write("\n");
    }
  }
}

/**
 * 执行 Anthropic API 流式测试
 */
export async function anthropicStreamTest(config: Config): Promise<StreamMetrics> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  const processor = new AnthropicStreamProcessor(client, config);
  return runStreamTest(processor, createTokenizer(config.model));
}

/**
 * 执行 OpenAI API 流式测试
 */
export async function openaiStreamTest(config: Config): Promise<StreamMetrics> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  const processor = new OpenAIStreamProcessor(client, config);
  return runStreamTest(processor, createTokenizer(config.model));
}

/**
 * 根据配置执行流式测试
 */
export async function streamTest(config: Config): Promise<StreamMetrics> {
  if (config.provider === "anthropic") {
    return anthropicStreamTest(config);
  }
  else {
    return openaiStreamTest(config);
  }
}

/**
 * 执行多次测试
 */
export async function runMultipleTests(config: Config): Promise<StreamMetrics[]> {
  const results: StreamMetrics[] = [];
  const messages = getMessages(config.lang);

  for (let i = 0; i < config.runCount; i++) {
    if (config.runCount > 1) {
      const label = `\n${messages.runProgressLabel(i + 1, config.runCount)}`;
      console.log(label);
      console.log("-".repeat(label.length - 1));
    }
    const result = await streamTest(config);
    results.push(result);
  }

  return results;
}
