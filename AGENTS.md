# AGENTS.md（仓库根目录）

本文件面向在本仓库工作的 agent/贡献者：如何构建/运行/检查，以及应遵守的代码与工作流约束。

## 0) 基本信息

- 项目类型：Node.js + TypeScript CLI（ESM）
- CLI 名称：`token-speed-test`
- 入口：`src/index.ts`
- 构建输出：`dist/`（由 `tsdown` 生成，主要产物 `dist/index.mjs` + `dist/index.d.mts`）
- 资源文件：`src/template.html` 会在构建后复制到 `dist/template.html`（用于 HTML 报告模板）
- 包管理：`pnpm`（建议配合 `@antfu/ni` 使用 `nci` / `nr`）

## 1) 常用命令（本地）

### 安装依赖

- `pnpm i`
- 或（推荐）：`pnpm i -g @antfu/ni` 后用 `nci`

### 开发（直接运行 TS）

- `pnpm dev -- --api-key sk-xxx`

### 构建

- `pnpm build`
  - 会额外执行 `node scripts/copy-assets.mjs` 复制 HTML 模板到 `dist/`

### 运行（构建后）

- `pnpm start -- --api-key sk-xxx`

### 质量检查

- `pnpm lint`
- `pnpm typecheck`

### 测试

- `pnpm test`
- 覆盖率：`pnpm test:coverage`

## 2) Git hooks（提交前检查）

仓库使用 `simple-git-hooks` + `lint-staged`。

- `prepare`：`pnpm prepare`（安装 hooks）
- `pre-commit`：确保依赖一致后再执行 `lint-staged`
- `lint-staged`：对暂存文件执行 `eslint --fix`

## 3) CI / Release

- CI：`.github/workflows/ci.yml`
  - `lint`：`nr lint` + `nr typecheck`
  - `test`：多平台（Ubuntu/Windows/macOS）运行 `nr build` + `nr test`

- Release：`.github/workflows/publish.yml`
  - 触发：push tag `v*`
  - 说明：如果启用了 npm Trusted Publisher，tag 推送将触发 CI 发布

## 4) 代码约束（硬规则）

- 禁止使用 `@ts-ignore` / `@ts-expect-error` 隐藏错误
- 不要用 `as any` 压制类型问题（需要时用 `unknown` + 类型收窄）
- CLI 允许 `console.*` 与 `process.exit()`
