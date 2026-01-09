# Token Speed Tester

> A CLI tool to measure and analyze LLM API token streaming performance

[Chinese README](README.md)

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
  - **Peak TPS**: Highest tokens received within a single second
  - **TPS Curve**: Tokens received per second throughout the stream
- **Statistical Analysis**: Mean, min, max, and standard deviation across multiple test runs
- **ASCII Visualization**: Beautiful terminal-based charts and tables
- **HTML Report**: Generate interactive HTML reports with SVG charts
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
# English output
token-speed-test --api-key sk-ant-xxx --lang en
# Test OpenAI API
token-speed-test --api-key sk-xxx --provider openai
```

### Advanced Options

```bash
# Custom model and multiple test runs
token-speed-test \
  --api-key sk-ant-xxx \
  --provider anthropic \
  --model claude-opus-4-5-20251101 \
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

# Generate HTML report (with SVG charts)
token-speed-test \
  --api-key sk-ant-xxx \
  --html \
  --output my-report.html

# Combined: Generate English HTML report
token-speed-test \
  --api-key sk-ant-xxx \
  --runs 5 \
  --html \
  -o performance-report.html \
  --lang en
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

| Option         | Short | Description                       | Default                   |
| -------------- | ----- | --------------------------------- | ------------------------- |
| `--api-key`    | `-k`  | API Key (required)                | -                         |
| `--provider`   | `-p`  | API type: `anthropic` or `openai` | `anthropic`               |
| `--model`      | `-m`  | Model name                        | Auto-selected by provider |
| `--url`        | `-u`  | Custom API endpoint               | Official endpoint         |
| `--runs`       | `-r`  | Number of test runs               | `3`                       |
| `--prompt`     |       | Test prompt                       | Language-specific         |
| `--max-tokens` |       | Maximum output tokens             | `1024`                    |
| `--lang`       |       | Output language: `zh` or `en`     | `zh`                      |
| `--html`       |       | Generate HTML report              | `false`                   |
| `--output`     | `-o`  | HTML report output path           | `report.html`             |

Note: The default prompt follows the selected language. Use `--lang en` for the English default prompt.

### Default Models

- **Anthropic**: `claude-opus-4-5-20251101`
- **OpenAI**: `gpt-5.2`

## Output Example

```
Token Speed Test
--------------------------------------------------
Provider: anthropic
Model: claude-opus-4-5-20251101
Max Tokens: 1024
Runs: 3
Prompt: Write a short essay about AI
--------------------------------------------------
Running tests...
Model output (streaming):
[Run 1]
  TTFT: 523ms
  Total Time: 3245ms
  Total Tokens: 412
  Avg Speed: 126.96 tokens/s
  Peak Speed: 156.32 tokens/s
  Peak TPS: 168.00 tokens/s
[Run 2]
  TTFT: 487ms
  Total Time: 3189ms
  Total Tokens: 398
  Avg Speed: 124.84 tokens/s
  Peak Speed: 158.41 tokens/s
  Peak TPS: 171.00 tokens/s
[Run 3]
  TTFT: 501ms
  Total Time: 3312ms
  Total Tokens: 405
  Avg Speed: 122.28 tokens/s
  Peak Speed: 154.23 tokens/s
  Peak TPS: 166.00 tokens/s
======================================================================
Token Speed Test Report
======================================================================
Summary (N=3)
+-----------------+--------+-------+-------+---------+
| Metric          | Mean   | Min   | Max   | Std Dev |
+-----------------+--------+-------+-------+---------+
| TTFT (ms)       | 503.67 | 487.00| 523.00| 14.57   |
| Total Time (ms) | 3248.67| 3189.00|3312.00|51.92   |
| Total Tokens    | 405.00 | 398.00| 412.00| 5.35   |
| Avg Speed       | 124.69 | 122.28| 126.96| 1.88   |
| Peak Speed      | 156.32 | 154.23| 158.41| 1.82   |
| Peak TPS        | 168.33 | 166.00| 171.00| 2.05   |
+-----------------+--------+-------+-------+---------+
Token Speed Trend (TPS)
[chart omitted]
TPS Distribution
[histogram omitted]
Tests complete!

```

### HTML Report

Use the `--html` option to generate a beautiful HTML report that includes:

- **Speed Trend Chart**: Multi-run speed curves with SVG animations
- **TPS Distribution**: Histogram of tokens per second
- **Summary Cards**: Key metrics like TTFT, average speed, peak speed
- **Detailed Data Table**: Complete data for each run
- **Responsive Design**: Works on desktop and mobile devices
- **Bilingual Support**: Automatically switches based on `--lang` setting

The report will automatically open in your browser after generation.

## Metrics Explained

| Metric            | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| **TTFT**          | Time to First Token - latency from request to first token arrival |
| **Total Time**    | Complete duration from request to stream completion               |
| **Total Tokens**  | Number of output tokens received                                  |
| **Average Speed** | Mean tokens per second (totalTokens / totalTime x 1000)           |
| **Peak Speed**    | Fastest speed measured over a sliding 10-token window             |
| **Peak TPS**      | Highest tokens received within a single second                    |
| **TPS Curve**     | Tokens received per second throughout the streaming response      |

Note: Token counting uses the model tokenizer per stream chunk; boundary splits may cause slight differences.

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

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and publishing.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
# Patch release (1.0.0 -> 1.0.1)
git commit -m "fix: fix some bug"

# Minor release (1.0.0 -> 1.1.0)
git commit -m "feat: add new feature"

# Major release (1.0.0 -> 2.0.0)
git commit -m "feat: add breaking change\n\nBREAKING CHANGE: deprecate old API"
```

After pushing to `master` branch, GitHub Actions will automatically:

- Analyze commit types to determine version
- Update CHANGELOG.md
- Create Git tag
- Publish to npm
- Create GitHub Release

## Test Coverage

This project maintains high code coverage:

| Coverage Type | Percentage |
| ------------- | ---------- |
| Statements    | 99.19%     |
| Branches      | 94.73%     |
| Functions     | 100%       |

## License

MIT (c) [Cansiny0320](https://github.com/Cansiny0320)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [npm Package](https://www.npmjs.com/package/token-speed-tester)
- [GitHub Repository](https://github.com/Cansiny0320/token-speed-tester)
- [Issues](https://github.com/Cansiny0320/token-speed-tester/issues)
- [Changelog](https://github.com/Cansiny0320/token-speed-tester/blob/master/CHANGELOG.md)
