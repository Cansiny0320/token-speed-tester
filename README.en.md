# Token Speed Tester

> A CLI tool to measure and analyze LLM API token streaming performance

[中文文档](README.md) |

[![npm version](https://badge.fury.io/js/token-speed-tester.svg)](https://www.npmjs.com/package/token-speed-tester)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/Cansiny0320/token-speed-tester/actions/workflows/publish.yml/badge.svg)](https://github.com/Cansiny0320/token-speed-tester/actions)

A powerful command-line tool for testing token output speed of LLM APIs. Supports **Anthropic** and **OpenAI** compatible APIs, providing detailed metrics including TTFT (Time to First Token), throughput, peak speed, and statistical analysis across multiple runs.

## Features

- **Dual Protocol Support**: Works with Anthropic Messages API and OpenAI Chat Completions API
- **Streaming Performance**: Measures each token's arrival time with millisecond precision
- **Comprehensive Metrics**:
  - **TTFT** (Time to First Token): Latency before first token arrives
  - **Average Speed**: Mean tokens per second
  - **Peak Speed**: Fastest speed over a 10-token window
  - **TPS Curve**: Tokens received per second throughout the stream
- **Statistical Analysis**: Mean, min, max, and standard deviation across multiple test runs
- **ASCII Visualization**: Beautiful terminal-based charts and tables
- **Custom Endpoints**: Test third-party APIs compatible with OpenAI/Anthropic protocols

## Installation

### Global Installation (Recommended)

```bash
npm install -g token-speed-tester
```

### Using npx (No Installation)

```bash
npx token-speed-tester --api-key sk-xxx
```

### Local Installation

```bash
npm install token-speed-tester
```

## Usage

### Basic Usage

```bash
# Test Anthropic API (default)
token-speed-test --api-key sk-ant-xxx

# Test OpenAI API
token-speed-test --api-key sk-xxx --provider openai
```

### Advanced Options

```bash
# Custom model and multiple test runs
token-speed-test \
  --api-key sk-ant-xxx \
  --provider anthropic \
  --model claude-3-5-sonnet-20241022 \
  --runs 5

# Test with custom endpoint and prompt
token-speed-test \
  --api-key sk-xxx \
  --provider openai \
  --url https://api.example.com/v1 \
  --model custom-model \
  --prompt "Explain quantum computing" \
  --max-tokens 2048 \
  --runs 10
```

### Local Development

```bash
# Clone and install dependencies
git clone https://github.com/Cansiny0320/token-speed-tester.git
cd token-speed-tester
npm install

# Run directly with tsx
npm run dev -- --api-key sk-ant-xxx

# Or build and run
npm run build
node dist/index.js --api-key sk-ant-xxx
```

## Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--api-key` | `-k` | API Key (required) | - |
| `--provider` | `-p` | API type: `anthropic` or `openai` | `anthropic` |
| `--model` | `-m` | Model name | Auto-selected by provider |
| `--url` | `-u` | Custom API endpoint | Official endpoint |
| `--runs` | `-r` | Number of test runs | `3` |
| `--prompt` | | Test prompt | "写一篇关于 AI 的短文" |
| `--max-tokens` | | Maximum output tokens | `1024` |

### Default Models

- **Anthropic**: `claude-3-5-sonnet-20241022`
- **OpenAI**: `gpt-4o-mini`

## Output Example

```
🚀 Token 速度测试工具
──────────────────────────────────────────
Provider: anthropic
Model: claude-3-5-sonnet-20241022
Max Tokens: 1024
Runs: 3
Prompt: 写一篇关于 AI 的短文
──────────────────────────────────────────

⏳ 正在运行测试...

[运行 1]
  TTFT: 523ms
  总耗时: 3245ms
  总 Token 数: 412
  平均速度: 126.96 tokens/s
  峰值速度: 156.32 tokens/s

[运行 2]
  TTFT: 487ms
  总耗时: 3189ms
  总 Token 数: 398
  平均速度: 124.84 tokens/s
  峰值速度: 158.41 tokens/s

[运行 3]
  TTFT: 501ms
  总耗时: 3312ms
  总 Token 数: 405
  平均速度: 122.28 tokens/s
  峰值速度: 154.23 tokens/s

======================================================================
Token 速度测试报告
======================================================================

统计汇总 (N=3)
┌──────────────────────────────────────────────────────────────────────┐
│ 指标             │       均值 │    最小值 │    最大值 │    标准差 │
├──────────────────────────────────────────────────────────────────────┤
│ TTFT (ms)       │    503.67 │   487.00 │   523.00 │    14.57 │
├──────────────────────────────────────────────────────────────────────┤
│ 总耗时 (ms)      │   3248.67 │  3189.00 │  3312.00 │    51.92 │
├──────────────────────────────────────────────────────────────────────┤
│ 总 Token 数     │    405.00 │  398.00 │  412.00 │     5.35 │
├──────────────────────────────────────────────────────────────────────┤
│ 平均速度        │    124.69 │  122.28 │  126.96 │     1.88 │
├──────────────────────────────────────────────────────────────────────┤
│ 峰值速度        │    156.32 │  154.23 │  158.41 │     1.82 │
└──────────────────────────────────────────────────────────────────────┘

Token 速度趋势图 (TPS)
┌────────────────────────────────────────┐
│ 120 ┤                         █         │
│ 100 ┤                     █ █ █ █       │
│  80 ┤                 █ █ █ █ █ █ █     │
│  60 ┤             █ █ █ █ █ █ █ █ █ █   │
│  40 ┤         █ █ █ █ █ █ █ █ █ █ █ █   │
│  20 ┤     █ █ █ █ █ █ █ █ █ █ █ █ █ █   │
│   0 └────────────────────────────────── │
│     0s   1s   2s   3s   4s   5s   6s    │
└────────────────────────────────────────┘

TPS 分布
0.0-12.0 │██████████████████████████████████████████████████ 45
12.0-24.0 │██ 3
24.0-36.0 │ 0
36.0-48.0 │ 0
48.0-60.0 │ 0
60.0-72.0 │ 0
72.0-84.0 │ 0
84.0-96.0 │ 0
96.0-108.0 │ 0
108.0-120.0 │ 0

✅ 测试完成!
```

## Metrics Explained

| Metric | Description |
|--------|-------------|
| **TTFT** | Time to First Token - latency from request to first token arrival |
| **Total Time** | Complete duration from request to stream completion |
| **Total Tokens** | Number of output tokens received |
| **Average Speed** | Mean tokens per second (totalTokens / totalTime × 1000) |
| **Peak Speed** | Fastest speed measured over a sliding 10-token window |
| **TPS Curve** | Tokens received per second throughout the streaming response |

## Development

### Running Tests

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Building

```bash
npm run build
```

### Release

```bash
# Patch release (1.0.3 -> 1.0.4)
npm run release

# Minor release (1.0.3 -> 1.1.0)
npm run release:minor

# Major release (1.0.3 -> 2.0.0)
npm run release:major
```

## Test Coverage

This project maintains high code coverage:

| Coverage Type | Percentage |
|---------------|------------|
| Statements | 99.19% |
| Branches | 94.73% |
| Functions | 100% |

## License

MIT © [Cansiny0320](https://github.com/Cansiny0320)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [npm Package](https://www.npmjs.com/package/token-speed-tester)
- [GitHub Repository](https://github.com/Cansiny0320/token-speed-tester)
- [Issues](https://github.com/Cansiny0320/token-speed-tester/issues)
