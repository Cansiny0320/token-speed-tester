# Token Speed Tester / Studio

> Measure LLM and Codex time to first token, throughput, and streaming speed with CLI, web, and desktop tools for macOS, Windows, and Linux.

[Chinese README](README.md) · [Open website](https://token-speed-studio.cansiny0320.chatgpt.site) · [Download desktop apps](https://github.com/Cansiny0320/token-speed-tester/releases/tag/desktop-v1.0.0) · [Studio docs (Chinese)](docs/studio.md)

[![npm version](https://img.shields.io/npm/v/token-speed-tester)](https://www.npmjs.com/package/token-speed-tester)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/Cansiny0320/token-speed-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/Cansiny0320/token-speed-tester/actions/workflows/ci.yml)

<p align="center">
  <img src="./docs/images/studio.png" alt="Studio displaying a saved report from a real short Codex run" width="800">
</p>

**Token Speed Studio** provides desktop and web interfaces; **token-speed-tester** provides the CLI. Test a locally signed-in **Codex / ChatGPT subscription**, **OpenAI Chat Completions**, or **Anthropic Messages**. The screenshot illustrates one real short run, not a representative model benchmark.

## Features

- **Three providers:** local Codex, OpenAI-compatible APIs, and Anthropic-compatible APIs.
- **Web and desktop:** live text and TPS charts. Run the desktop app independently or pair it with the website.
- **Measurements:** TTFT, average throughput, per-second peaks, and repeated-run statistics. Studio records initialization time and output/reasoning usage separately.
- **Codex controls:** model, reasoning effort, repetitions, timeout, and cancellation. Each run uses an isolated temporary session with tools, MCP servers, plugins, and hooks disabled.
- **Local reports:** JSON / CSV / HTML exports. Studio retains the six most recent local reports and imports its own JSON format. Failed or cancelled Studio runs are excluded from summaries.
- **CLI:** terminal charts, custom endpoints, bilingual output and reports, and existing API workflows.

Codex credentials stay local. Tests consume the current account's quota. Models and reasoning efforts are discovered from the local Codex installation.

## Desktop and web

The website is a static client. Benchmarks run on the visitor's computer through the desktop app; it does not provide hosted accounts or cloud benchmark execution.

| Platform | Download |
| --- | --- |
| macOS Apple Silicon | [dmg](https://github.com/Cansiny0320/token-speed-tester/releases/download/desktop-v1.0.0/Token-Speed-Studio-1.0.0-mac-arm64.dmg) |
| macOS Intel | [dmg](https://github.com/Cansiny0320/token-speed-tester/releases/download/desktop-v1.0.0/Token-Speed-Studio-1.0.0-mac-x64.dmg) |
| Windows x64 | [exe](https://github.com/Cansiny0320/token-speed-tester/releases/download/desktop-v1.0.0/Token-Speed-Studio-1.0.0-win-x64.exe) |
| Linux x64 · AppImage | [AppImage](https://github.com/Cansiny0320/token-speed-tester/releases/download/desktop-v1.0.0/Token-Speed-Studio-1.0.0-linux-x86_64.AppImage) |
| Debian / Ubuntu x64 | [deb](https://github.com/Cansiny0320/token-speed-tester/releases/download/desktop-v1.0.0/Token-Speed-Studio-1.0.0-linux-amd64.deb) |

[Full release and ZIP packages](https://github.com/Cansiny0320/token-speed-tester/releases/tag/desktop-v1.0.0) · [SHA256SUMS.txt](https://github.com/Cansiny0320/token-speed-tester/releases/download/desktop-v1.0.0/SHA256SUMS.txt). Initial packages are unsigned and not notarized. A real benchmark was verified on macOS Apple Silicon. Intel Mac, Windows, and Linux builds have not yet been tested on their respective systems.

1. Install and open the desktop app. For Codex, install Codex CLI and run `codex login`; an existing ChatGPT login can be reused. Select the executable manually if automatic detection fails.
2. Select a provider, model, prompt, and repetition count. API providers require their own API key and endpoint.
3. To use the [website](https://token-speed-studio.cansiny0320.chatgpt.site), enter the desktop app's port and pairing code, approve the origin in the desktop dialog, and allow browser access to the local network.
4. Pairing codes expire after five minutes; connections last up to eight hours and expire when the desktop app exits.

Pairing and a real benchmark have been verified in Chrome. The Codex in-app browser timed out during verification; use the desktop app if browser connection fails.

**Release status (2026-10-12):** desktop `1.0.0` is available. npm currently publishes `1.11.1`; the new Studio / Codex functionality has not been published to npm. The npm commands below are for the API CLI. Use desktop or the source checkout for Codex.

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
# Test OpenAI API (default)
token-speed-tester --api-key sk-xxx
# English output
token-speed-tester --api-key sk-xxx --lang en
# Test Anthropic API
token-speed-tester --api-key sk-ant-xxx --provider anthropic
```

### Advanced Options

```bash
# Custom model and multiple test runs
token-speed-tester \
  --api-key sk-ant-xxx \
  --provider anthropic \
  --model claude-opus-4-5-20251101 \
  --runs 5

# Test with custom endpoint and prompt
token-speed-tester \
  --api-key sk-xxx \
  --provider openai \
  --url https://api.example.com/v1 \
  --model custom-model \
  --prompt "Explain quantum computing" \
  --max-tokens 2048 \
  --runs 10

# Generate HTML report (with SVG charts)
token-speed-tester \
  --api-key sk-xxx \
  --output-format html \
  --output my-report.html

# Generate JSON report
token-speed-tester \
  --api-key sk-xxx \
  --output-format json \
  --output report.json

# Generate CSV report
token-speed-tester \
  --api-key sk-xxx \
  --output-format csv \
  --output report.csv

# Combined: Generate English HTML report
token-speed-tester \
  --api-key sk-xxx \
  --runs 5 \
  --output-format html \
  -o performance-report.html \
  --lang en
```

### Run Codex from source

These commands use the Studio feature branch. Use `desktop-v1.0.0` instead to reproduce the desktop release's source.

```sh
git clone --branch feat/token-speed-studio https://github.com/Cansiny0320/token-speed-tester.git
cd token-speed-tester
pnpm install
pnpm build

# Local Codex login; no API key required
node dist/index.mjs --provider codex --runs 1 --effort low --output-format terminal

# Select an executable and export a report
node dist/index.mjs --provider codex --codex-path /path/to/codex \
  --timeout 120000 --output-format json --output codex-report.json
```

Omit `--model` to use the local Codex configuration. `--max-tokens` applies only to APIs. For Codex, request output length in the prompt and bound each run with `--timeout`.

## Options in the current source

| Option            | Short | Description                                   | Default                   |
| ----------------- | ----- | --------------------------------------------- | ------------------------- |
| `--api-key`       | `-k`  | Required for API providers; not Codex                            | -                         |
| `--provider`      | `-p`  | Provider: `anthropic` / `openai` / `codex`             | `openai`                  |
| `--model`         | `-m`  | Model name                                    | Auto-selected by provider |
| `--url`           | `-u`  | Custom API endpoint                           | Official endpoint         |
| `--runs`          | `-r`  | Number of test runs                           | `3`                       |
| `--prompt`        |       | Test prompt                                   | Language-specific         |
| `--max-tokens`    |       | Maximum API output tokens                         | `1024`                    |
| `--lang`          |       | Output language: `zh` or `en`                 | `zh`                      |
| `--output-format` | `-f`  | Output format: `terminal`/`json`/`csv`/`html` | `html`                    |
| `--output`        | `-o`  | Output file path (default `report.{ext}`)     | `report.{ext}`            |
| `--codex-path` | | Codex executable path | Auto-detected |
| `--effort` | | Codex reasoning effort, subject to model support | `low` |
| `--timeout` | | Codex per-run timeout in ms, `5000–600000` | `120000` |

Note: The default prompt follows the selected language. Use `--lang en` for the English default prompt.

### Default Models

- **Anthropic**: `claude-opus-4-5-20251101`
- **OpenAI**: `gpt-5.2`
- **Codex**: `auto` (locally configured model)

These are project defaults, not claims about the newest models or account access. Override them with `--model`.

## Reports

### HTML Report

Use the `--output-format html` option to generate a beautiful HTML report that includes:

- **Speed Trend Chart**: Multi-run speed curves with SVG animations
- **TPS Distribution**: Histogram of tokens per second
- **Summary Cards**: Key metrics like TTFT, average speed, peak speed
- **Detailed Data Table**: Complete data for each run
- **Responsive Design**: Works on desktop and mobile devices
- **Bilingual Support**: Automatically switches based on `--lang` setting

The report will automatically open in your browser after generation.

## CLI metrics

| Metric            | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| **TTFT**          | Request start to the first non-empty visible text |
| **Total Time**    | Complete duration from request to stream completion               |
| **Total Tokens**  | Number of output tokens received                                  |
| **Average Speed** | Mean tokens per second (totalTokens / totalTime x 1000)           |
| **Peak Speed**    | Fastest speed over at least 10 tokens, extending toward 50ms             |
| **Peak TPS**      | Highest tokens received within a single second                    |
| **TPS Curve**     | Tokens received per second throughout the streaming response      |

Note: Total tokens prefer server usage (subtracting separately reported OpenAI reasoning tokens), falling back to tokenizing the complete output text. Official OpenAI endpoints request streaming usage; custom endpoints are not required to support `stream_options`, but returned usage is used when available.

TPS and peak speed use local tokenization of the complete visible text. Each token is assigned the arrival time of the chunk containing its final byte. These client-side estimates may differ from server totals; unknown models use `cl100k_base`. Peak windows expand toward 50ms and use the actual observed duration for short streams. If all tokens arrive simultaneously, the generation rate cannot be inferred and peak speed is 0. TTFT is recorded at the first non-empty text; total time excludes tokenizer initialization, post-stream tokenization, and cleanup.

OpenAI GPT-5 and later families and o-series models use `max_completion_tokens`, which includes reasoning tokens. Older models and other compatible models retain `max_tokens`.

Studio records initialization time and raw provider usage separately. Keep the model, prompt, reasoning effort, output length, and network conditions consistent when comparing results. Studio JSON and CLI JSON have different schemas; Studio imports reports exported by Studio.

## Development

### Web and desktop

Install dependencies separately in all three directories. Package manager versions are declared in their `package.json` files. The CLI requires Node.js 18 or later.

```sh
pnpm install
pnpm --dir apps/site install
pnpm --dir apps/desktop install

# Start in separate terminals
pnpm --dir apps/site dev
pnpm --dir apps/desktop dev

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --dir apps/desktop exec tsc --noEmit
pnpm --dir apps/desktop build
```

The website runs at `http://127.0.0.1:5173`. See [Studio documentation](docs/studio.md) for packaging and deployment.

### Running Tests

```bash
# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Generate coverage report
pnpm test:coverage
```

### Building

```bash
pnpm build
```

### CLI / npm release

This project publishes to npm automatically via GitHub Actions. Release process:

```bash
pnpm release          # Interactive version selection
# Or
pnpm release patch    # Patch version (1.0.0 -> 1.0.1)
pnpm release minor    # Minor version (1.0.0 -> 1.1.0)
pnpm release major    # Major version (1.0.0 -> 2.0.0)
```

bumpp will automatically: update version → commit → tag → push

After pushing a `v*` tag, GitHub Actions will automatically:

- Build the project
- Publish to npm
- Create GitHub Release

### Desktop and website releases

The [Desktop Build workflow](.github/workflows/desktop.yml) builds three-platform packages on manual dispatch and uploads Actions artifacts. GitHub Releases are published separately with `desktop-v*` tags. Sites versions and deployments are independent of npm and desktop releases.

## Verification

The `desktop-v1.0.0` release source passed 215 tests, lint, type checks, and builds. The CLI, packaged Mac Apple Silicon app, and Chrome website completed real Codex benchmarks. Run `pnpm test:coverage` for current coverage figures.

## License

MIT (c) [Cansiny0320](https://github.com/Cansiny0320)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [Website](https://token-speed-studio.cansiny0320.chatgpt.site)
- [Desktop downloads](https://github.com/Cansiny0320/token-speed-tester/releases/tag/desktop-v1.0.0)
- [Studio docs](docs/studio.md)
- [npm Package](https://www.npmjs.com/package/token-speed-tester)
- [GitHub Repository](https://github.com/Cansiny0320/token-speed-tester)
- [Issues](https://github.com/Cansiny0320/token-speed-tester/issues)
- [Changelog](https://github.com/Cansiny0320/token-speed-tester/blob/master/CHANGELOG.md)
