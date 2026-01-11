import type { Config } from "./config.js";
import type { StreamMetrics } from "./metrics.js";
import { performance } from "node:perf_hooks";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getMessages } from "./i18n.js";
import { createTokenizer } from "./tokenizer.js";

/**
 * 执行 Anthropic API 流式测试
 */
export async function anthropicStreamTest(config: Config): Promise<StreamMetrics> {
  const startTime = performance.now();
  const tokenTimes: number[] = [];
  let ttft = 0;
  let firstTokenRecorded = false;
  let tokenCount = 0;
  let wroteOutput = false;

  const encoding = createTokenizer(config.model);
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  try {
    const stream = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{ role: "user", content: config.prompt }],
      stream: true,
    });

    for await (const event of stream) {
      const currentTime = performance.now();

      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const text = event.delta.text;

        if (text && text.length > 0) {
          process.stdout.write(text);
          wroteOutput = true;
          const encoded = encoding.encode(text);
          const newTokens = encoded.length;

          if (newTokens > 0) {
            if (!firstTokenRecorded) {
              ttft = currentTime - startTime;
              firstTokenRecorded = true;
            }

            // 为当前批次的新增 token 记录到达时间
            for (let i = 0; i < newTokens; i++) {
              tokenTimes.push(currentTime - startTime);
            }

            tokenCount += newTokens;
          }
        }
      }
    }
  }
  catch (error) {
    if (error instanceof Error) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
    throw error;
  }
  finally {
    if (wroteOutput) {
      process.stdout.write("\n");
    }
    encoding.free();
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    ttft,
    tokens: tokenTimes,
    totalTokens: tokenCount,
    totalTime,
  };
}

/**
 * 执行 OpenAI API 流式测试
 */
export async function openaiStreamTest(config: Config): Promise<StreamMetrics> {
  const startTime = performance.now();
  const tokenTimes: number[] = [];
  let ttft = 0;
  let firstTokenRecorded = false;
  let tokenCount = 0;
  let wroteOutput = false;

  const encoding = createTokenizer(config.model);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{ role: "user", content: config.prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const currentTime = performance.now();

      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        const content = delta.content;

        if (content.length > 0) {
          process.stdout.write(content);
          wroteOutput = true;
          const encoded = encoding.encode(content);
          const newTokens = encoded.length;

          if (newTokens > 0) {
            if (!firstTokenRecorded) {
              ttft = currentTime - startTime;
              firstTokenRecorded = true;
            }

            // 为当前批次的新增 token 记录到达时间
            for (let i = 0; i < newTokens; i++) {
              tokenTimes.push(currentTime - startTime);
            }

            tokenCount += newTokens;
          }
        }
      }
    }
  }
  catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
    throw error;
  }
  finally {
    if (wroteOutput) {
      process.stdout.write("\n");
    }
    encoding.free();
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    ttft,
    tokens: tokenTimes,
    totalTokens: tokenCount,
    totalTime,
  };
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
