# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool (`token-speed-test`) for measuring LLM API token streaming performance. It supports both Anthropic and OpenAI-compatible APIs, providing metrics like TTFT (Time to First Token), throughput, peak speed, and statistical analysis across multiple runs.

## Build and Test Commands

```bash
# Development - run directly with tsx
npm run dev -- --api-key sk-xxx

# Build the project
npm run build

# Type checking
npm run typecheck

# Linting and formatting
npm run lint
npm run lint:fix
npm run format
npm run format:check

# Testing
npm test                    # Run tests once
npm run test:watch          # Watch mode
npm run test:ui             # Vitest UI
npm run test:coverage       # With coverage report
```

## Architecture

The codebase follows a modular architecture with clear separation of concerns:

### Core Modules (src/)

- **index.ts** - CLI entry point using Commander.js. Parses arguments, orchestrates the test flow, and displays results.
- **config.ts** - Configuration parsing and validation. Handles CLI args, defaults, and provider-specific settings.
- **client.ts** - API clients for Anthropic and OpenAI streaming. Each has dedicated functions (`anthropicStreamTest`, `openaiStreamTest`) that:
  - Use `tiktoken` for accurate token counting per streaming chunk
  - Record timestamps for each token arrival
  - Return `StreamMetrics` with timing data
- **metrics.ts** - Statistical calculations from raw timing data:
  - `calculateMetrics()` - Converts `StreamMetrics` to `CalculatedMetrics` (TTFT, average/peak speeds, TPS curve)
  - `calculateStats()` - Aggregates multiple runs into mean/min/max/stddev
  - Peak speed uses a 10-token sliding window
- **tokenizer.ts** - Wrapper around `tiktoken` with fallback to `cl100k_base`
- **chart.ts** - ASCII terminal visualization for speed charts and TPS histograms
- **i18n.ts** - Internationalization (zh/en) for all user-facing strings

### Data Flow

1. CLI args → `parseConfig()` → `Config` object
2. `runMultipleTests()` → calls `streamTest()` N times → `StreamMetrics[]`
3. `calculateMetrics()` on each result → `CalculatedMetrics[]`
4. `calculateStats()` aggregates all → `StatsResult`
5. `renderReport()` displays ASCII charts and statistics

### Key Interfaces

```typescript
// Raw timing data from a single API call
interface StreamMetrics {
  ttft: number; // First token latency (ms)
  tokens: number[]; // Each token's arrival timestamp
  totalTokens: number;
  totalTime: number;
}

// Computed metrics for display
interface CalculatedMetrics {
  ttft: number;
  totalTime: number;
  totalTokens: number;
  averageSpeed: number; // tokens/s
  peakSpeed: number; // max 10-token window speed
  peakTps: number; // max tokens in any single second
  tps: number[]; // tokens per second curve
}
```

## Conventions

- **ES modules only** - `"type": "module"` in package.json
- **TypeScript strict mode** enabled
- **Token counting** - Uses `tiktoken` for accurate counts; call `encoding.free()` after use
- **Testing** - Vitest with high coverage (>99% statement, ~95% branch)
- **i18n** - All user-facing strings go through `getMessages(lang)`
- **CLI output** - Uses `chalk` for colors; streaming output goes directly to `process.stdout`

## Release Process

Uses `semantic-release` with conventional commits. Format:

- `feat:` - minor version bump
- `fix:` - patch version bump
- `BREAKING CHANGE:` - major version bump

Commits to `master` trigger automatic release via GitHub Actions.
