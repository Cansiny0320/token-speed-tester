#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import type { Provider } from "./config.js";
import { parseConfig, type OutputFormat } from "./config.js";
import { runMultipleTests } from "./client.js";
import { calculateMetrics, calculateStats } from "./metrics.js";
import { renderReport, renderSingleResult } from "./chart.js";
import { generateHTMLReport } from "./html-report.js";
import { generateCSVExport, generateJSONExport } from "./export.js";
import { DEFAULT_LANG, getMessages } from "./i18n.js";

function getCliVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packagePath = join(currentDir, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8")) as { version?: string };
    return packageJson.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const program = new Command();

program
  .name("token-speed-test")
  .description("A CLI tool to test LLM API token output speed")
  .version(getCliVersion());

program
  .option("-k, --api-key <key>", "API Key (required)", "")
  .option("-p, --provider <provider>", "API provider: anthropic or openai", "anthropic")
  .option("-u, --url <url>", "Custom API endpoint URL")
  .option("-m, --model <model>", "Model name")
  .option("--max-tokens <number>", "Maximum output tokens", "1024")
  .option("-r, --runs <number>", "Number of test runs", "3")
  .option("--prompt <text>", "Test prompt")
  .option("--lang <lang>", "Output language: zh or en", "zh")
  .option("-f, --output-format <format>", "Output format: terminal, json, csv, html", "terminal")
  .option("-o, --output <path>", "Output file path (default: report.{ext})")
  .parse(process.argv);

const options = program.opts();

async function main() {
  let messages = getMessages(DEFAULT_LANG);
  try {
    // 解析配置
    const config = parseConfig({
      apiKey: options.apiKey,
      provider: options.provider as Provider,
      url: options.url,
      model: options.model,
      maxTokens: parseInt(options.maxTokens, 10),
      runs: parseInt(options.runs, 10),
      prompt: options.prompt,
      lang: options.lang,
      outputFormat: options.outputFormat as OutputFormat,
      outputPath: options.output,
    });
    messages = getMessages(config.lang);

    // 显示配置信息
    console.log(chalk.cyan(`\n${messages.appTitle}`));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.gray(`${messages.configLabels.provider}: ${chalk.white(config.provider)}`));
    console.log(chalk.gray(`${messages.configLabels.model}: ${chalk.white(config.model)}`));
    console.log(chalk.gray(`${messages.configLabels.maxTokens}: ${chalk.white(config.maxTokens)}`));
    console.log(chalk.gray(`${messages.configLabels.runs}: ${chalk.white(config.runCount)}`));
    console.log(
      chalk.gray(
        `${messages.configLabels.prompt}: ${chalk.white(config.prompt.substring(0, 50))}${
          config.prompt.length > 50 ? "..." : ""
        }`
      )
    );
    console.log(chalk.gray("─".repeat(50)));

    // 执行测试
    console.log(chalk.yellow(`\n${messages.runningTests}\n`));
    console.log(chalk.gray(`${messages.streamingOutput}\n`));

    const results = await runMultipleTests(config);

    // 计算指标
    const allMetrics = results.map((r) => calculateMetrics(r));

    // 计算统计
    const stats = calculateStats(allMetrics);

    // 根据输出格式处理结果
    if (config.outputFormat === "terminal") {
      // 显示每次运行的结果
      for (let i = 0; i < allMetrics.length; i++) {
        console.log(chalk.gray(renderSingleResult(allMetrics[i], i, config.lang)));
      }

      // 显示报告
      console.log(chalk.cyan("\n" + renderReport(stats, config.lang)));
    } else if (config.outputFormat === "json") {
      const jsonContent = generateJSONExport(config, allMetrics, stats);
      await fsWriteFile(config.outputPath, jsonContent, "utf-8");
      console.log(chalk.cyan(`\n✓ JSON report generated: ${config.outputPath}\n`));
    } else if (config.outputFormat === "csv") {
      const csvContent = generateCSVExport(config, allMetrics, stats);
      await fsWriteFile(config.outputPath, csvContent, "utf-8");
      console.log(chalk.cyan(`\n✓ CSV report generated: ${config.outputPath}\n`));
    } else if (config.outputFormat === "html") {
      const htmlContent = generateHTMLReport({
        config,
        singleResults: allMetrics,
        stats,
        lang: config.lang,
        messages,
      });

      await fsWriteFile(config.outputPath, htmlContent, "utf-8");
      console.log(chalk.cyan(`\n✓ HTML report generated: ${config.outputPath}\n`));

      // 自动打开浏览器
      await open(config.outputPath).catch(() => {
        console.warn(
          chalk.yellow(`Could not auto-open report, please open manually: ${config.outputPath}`)
        );
      });
    }

    console.log(chalk.green(`${messages.testComplete}\n`));
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\n${messages.errorPrefix}: ${error.message}\n`));
    } else {
      console.error(chalk.red(`\n${messages.unknownError}\n`));
    }
    process.exit(1);
  }
}

void main();
