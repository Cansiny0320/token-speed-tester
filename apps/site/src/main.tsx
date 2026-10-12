import type { ReactNode } from "react";
import type { BenchmarkConfig, BenchmarkRun, BenchmarkSnapshot, Effort, PairingInfo, StudioInfo } from "./protocol";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import downloads from "./downloads.json";
import { DEFAULT_BENCHMARK_CONFIG } from "./protocol";
import { demoReport, downloadReport, formatMs, formatNumber, parseReport, statusText, summary } from "./reports";
import siteInfo from "./site-info.json";
import { cancelRun, desktop, disconnect, getInfo, getState, hasConnection, pair, startRun } from "./transport";
import "./style.css";

const idle: BenchmarkSnapshot = { id: "", version: 0, phase: "idle", config: null, startedAt: null, runs: [] };
const HISTORY_KEY = "token-speed-history-v1";
function initialHistory(): BenchmarkSnapshot[] {
  try {
    return (JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as unknown[]).map(value => parseReport(JSON.stringify({ schemaVersion: 1, snapshot: value })));
  }
  catch {
    return [];
  }
}
const message = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请重试。";
function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      aria-labelledby="dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-body">
        <div className="panel-heading">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" onClick={close} aria-label="关闭">×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function Curve({ run }: { run?: BenchmarkRun }) {
  const values = run?.tps ?? [];
  const max = Math.max(20, ...values);
  const height = 170;
  const width = 760;
  const left = 38;
  const bottom = 145;
  const x = (i: number) => left + i / Math.max(1, values.length - 1) * (width - left - 18);
  const y = (n: number) => bottom - n / max * 116;
  const line = values.map((value, i) => `${i ? "L" : "M"}${x(i)},${y(value)}`).join(" ");
  return (
    <div className="curve">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={values.length ? "每秒可见文本 Token 估算曲线" : "暂无测速曲线"}>
        <defs>
          <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#6fc4ff" stopOpacity=".28" />
            <stop offset="1" stopColor="#6fc4ff" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
          <g key={ratio}>
            <line x1={left} x2={width - 18} y1={y(ratio * max)} y2={y(ratio * max)} stroke="#293943" strokeDasharray="3 5" />
            <text x={left - 9} y={y(ratio * max) + 4} textAnchor="end">{Math.round(ratio * max)}</text>
          </g>
        ))}
        {values.length > 0 && (
          <>
            <path d={`${line} L${x(values.length - 1)},${bottom} L${left},${bottom} Z`} fill="url(#curve-fill)" />
            <path d={line} stroke="#6fc4ff" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
            {values.map((value, i) => (
              <circle key={i} cx={x(i)} cy={y(value)} r={values.length > 40 ? 1 : 3} fill="#a5daff">
                <title>
                  {i}
                  s ·
                  {" "}
                  {value}
                  {" "}
                  tokens
                </title>
              </circle>
            ))}
          </>
        )}
        {[0, 1, 2, 3, 4].map(i => (
          <text key={i} x={left + i / 4 * (width - left - 18)} y={166} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
            {Math.round(i / 4 * Math.max(values.length - 1, 4))}
            s
          </text>
        ))}
      </svg>
      {!values.length && <div className="chart-empty">输出到达后，速度将在这里展开。</div>}
    </div>
  );
}
function App() {
  const [config, setConfig] = useState<BenchmarkConfig>({ ...DEFAULT_BENCHMARK_CONFIG });
  const [connected, setConnected] = useState(hasConnection());
  const [info, setInfo] = useState<StudioInfo>();
  const [live, setLive] = useState(idle);
  const [savedView, setSavedView] = useState<BenchmarkSnapshot>();
  const [history, setHistory] = useState(initialHistory);
  const [selectedRun, setSelectedRun] = useState<number>();
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"connect" | "downloads">();
  const [code, setCode] = useState("");
  const [port, setPort] = useState("46321");
  const [pairing, setPairing] = useState<PairingInfo>();
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const lastSaved = useRef("");
  const view = savedView ?? live;
  const run = view.runs.find(item => item.index === selectedRun) ?? view.runs.at(-1);
  const active = live.phase === "preparing" || live.phase === "running";
  const stats = summary(view.runs);
  const demo = view.id === "demo-example";
  const set = <K extends keyof BenchmarkConfig>(key: K, value: BenchmarkConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));
  async function refreshInfo() {
    setChecking(true);
    try {
      setInfo(await getInfo());
    }
    catch (error) {
      setNotice(message(error));
      setConnected(hasConnection());
    }
    finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (connected) void refreshInfo();
  }, [connected]);
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await getState();
        if (!stopped) {
          setLive(state);
          if (state.id && ["completed", "failed", "cancelled"].includes(state.phase) && lastSaved.current !== state.id) {
            lastSaved.current = state.id;
            setHistory((previous) => {
              const next = [state, ...previous.filter(item => item.id !== state.id)].slice(0, 6);
              try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
              }
              catch {
                setNotice("本地历史空间不足，请导出当前报告保存。");
              }
              return next;
            });
          }
        }
      }
      catch (error) {
        if (!stopped) {
          setNotice(message(error));
          if (!hasConnection()) setConnected(false);
        }
      }
      finally {
        if (!stopped) timer = setTimeout(poll, 600);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected]);
  useEffect(() => {
    if (outputRef.current && active) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [run?.text, active]);
  async function begin() {
    setPending(true);
    setNotice("");
    try {
      setSavedView(undefined);
      setSelectedRun(undefined);
      setLive(await startRun(config));
    }
    catch (error) {
      setNotice(message(error));
    }
    finally {
      setPending(false);
    }
  }
  async function showConnection() {
    setModal("connect");
    setNotice("");
    if (desktop) {
      try {
        setPairing(await desktop.pairing());
      }
      catch (error) {
        setNotice(message(error));
      }
    }
  }
  async function connect() {
    setPending(true);
    setNotice("");
    try {
      await pair(code.trim(), Number(port));
      setConnected(true);
      setModal(undefined);
    }
    catch (error) {
      setNotice(message(error));
    }
    finally {
      setPending(false);
    }
  }
  async function selectCodex() {
    if (!desktop) return;
    try {
      if (await desktop.selectCodex()) await refreshInfo();
    }
    catch (error) {
      setNotice(message(error));
    }
  }
  const selectedModel = info?.codex.models.find(model => model.id === config.model || (config.model === "auto" && model.id === info.codex.configuredModel));
  const efforts = selectedModel?.efforts.length ? selectedModel.efforts : ["low", "medium", "high"];
  const codexReady = config.provider !== "codex" || info?.codex.authenticated;
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" onClick={event => event.preventDefault()}>
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            Token Speed
            <b>Studio</b>
          </span>
          <span className="version">1.0</span>
        </a>
        <nav aria-label="主要操作">
          <button
            className="text-button"
            onClick={() => {
              setSavedView(demoReport());
              setSelectedRun(undefined);
            }}
          >
            查看示例
          </button>
          <button className="text-button" onClick={() => setModal("downloads")}>桌面版 ↗</button>
          <button className={`connection ${connected ? "is-connected" : ""}`} onClick={() => void showConnection()}>
            <span className="status-dot" />
            {desktop ? "本机运行" : connected ? "已连接本机" : "连接本机软件"}
          </button>
        </nav>
      </header>
      <main>
        <section className="page-title">
          <div>
            <p className="eyebrow">LLM PERFORMANCE LAB</p>
            <h1>让模型速度，有据可比。</h1>
            <p>从首字等待到持续输出，在你的电脑上测量真实体验。</p>
          </div>
          <span className="local-note">
            <span>⌁</span>
            {" "}
            本机计时 · 凭证留在本机
          </span>
        </section>
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="关闭提示">×</button>
          </div>
        )}
        {demo && (
          <div className="demo-notice">
            演示报告 · 以下数据为样例，未调用任何模型。
            <button onClick={() => setSavedView(undefined)}>返回当前测速</button>
          </div>
        )}
        {savedView && !demo && (
          <div className="demo-notice">
            正在查看本地报告 ·
            {savedView.startedAt && new Date(savedView.startedAt).toLocaleString()}
            <button onClick={() => setSavedView(undefined)}>返回当前测速</button>
          </div>
        )}
        <div className="workspace">
          <aside className="config-panel panel">
            <div className="panel-heading">
              <h2>测试配置</h2>
              <span className="small-label">CONFIGURATION</span>
            </div>
            <fieldset disabled={active || pending}>
              <legend className="sr-only">测速参数</legend>
              <label className="field-label">接入方式</label>
              <div className="provider-tabs" role="group" aria-label="接入方式">{["codex", "openai", "anthropic"].map(provider => <button key={provider} className={config.provider === provider ? "selected" : ""} onClick={() => setConfig(previous => ({ ...previous, provider: provider as BenchmarkConfig["provider"], model: provider === "codex" ? "auto" : provider === "openai" ? "gpt-5.2" : "claude-opus-4-5-20251101" }))}>{provider === "codex" ? "Codex" : provider === "openai" ? "OpenAI" : "Anthropic"}</button>)}</div>
              {config.provider === "codex"
                ? (
                    <div className="provider-note">
                      <span className={`status-dot ${info?.codex.authenticated ? "ready" : ""}`} />
                      <div>
                        {checking ? "正在检查 Codex…" : info?.codex.authenticated ? `ChatGPT ${info.codex.plan ?? "订阅"} · 已登录` : connected ? "需要本机 Codex 登录" : "使用本机 ChatGPT 订阅账号"}
                        <small>{info?.codex.error ?? "无需 API Key，测试会消耗当前账号额度。"}</small>
                      </div>
                    </div>
                  )
                : (
                    <>
                      <label className="field-label" htmlFor="api-key">API Key</label>
                      <input id="api-key" type="password" autoComplete="off" placeholder="仅用于本次会话" value={config.apiKey ?? ""} onChange={event => set("apiKey", event.target.value)} />
                      <label className="field-label" htmlFor="base-url">
                        Base URL
                        <span>可选</span>
                      </label>
                      <input id="base-url" type="url" placeholder="留空使用官方 API" value={config.baseURL ?? ""} onChange={event => set("baseURL", event.target.value)} />
                    </>
                  )}
              <label className="field-label" htmlFor="model">模型</label>
              {config.provider === "codex"
                ? (
                    <select
                      id="model"
                      value={config.model}
                      onChange={(event) => {
                        const model = info?.codex.models.find(item => item.id === event.target.value);
                        setConfig(previous => ({ ...previous, model: event.target.value, effort: (model?.defaultEffort ?? "low") as Effort }));
                      }}
                    >
                      <option value="auto">
                        {info?.codex.configuredModel ?? "Codex 本机配置模型"}
                        {" "}
                        · 默认
                      </option>
                      {info?.codex.models.map(model => <option value={model.id} key={model.id}>{model.name}</option>)}
                    </select>
                  )
                : <input id="model" value={config.model} onChange={event => set("model", event.target.value)} />}
              <div className="fields-row">
                <div>
                  <label className="field-label" htmlFor="runs">重复次数</label>
                  <input id="runs" type="number" min="1" max="30" value={config.runs} onChange={event => set("runs", Number(event.target.value))} />
                </div>
                <div>
                  {config.provider === "codex"
                    ? (
                        <>
                          <label className="field-label" htmlFor="effort">推理强度</label>
                          <select id="effort" value={config.effort} onChange={event => set("effort", event.target.value as Effort)}>{efforts.map(value => <option value={value} key={value}>{value}</option>)}</select>
                        </>
                      )
                    : (
                        <>
                          <label className="field-label" htmlFor="max-tokens">Token 上限</label>
                          <input id="max-tokens" type="number" min="1" max="32768" value={config.maxTokens} onChange={event => set("maxTokens", Number(event.target.value))} />
                        </>
                      )}
                </div>
              </div>
              <label className="field-label" htmlFor="prompt">测试提示词</label>
              <textarea id="prompt" rows={5} maxLength={32000} value={config.prompt} onChange={event => set("prompt", event.target.value)} />
              <div className="timeout-row">
                <label htmlFor="timeout">每轮超时</label>
                <select id="timeout" value={config.timeoutMs} onChange={event => set("timeoutMs", Number(event.target.value))}>
                  <option value={60000}>60 秒</option>
                  <option value={120000}>120 秒</option>
                  <option value={300000}>300 秒</option>
                  <option value={600000}>600 秒</option>
                </select>
              </div>
            </fieldset>
            {active ? <button className="stop-button" onClick={() => void cancelRun().catch(error => setNotice(message(error)))}>■ 停止测速</button> : <button className="primary-button" disabled={pending || !connected || !codexReady} onClick={() => void begin()}>{pending ? "正在启动…" : "▶  开始测速"}</button>}
            {!connected && <button className="connect-hint" onClick={() => void showConnection()}>连接本机软件后开始 →</button>}
            <p className="config-footnote">每轮独立会话，顺序执行。Codex 测试不调用工具；相同参数更便于比较。</p>
            {connected && (
              <div className="setup-actions">
                <button onClick={() => void refreshInfo()} disabled={checking}>{checking ? "检查中…" : "刷新 Codex 状态"}</button>
                {desktop && <button onClick={() => void selectCodex()}>选择 Codex 路径</button>}
              </div>
            )}
          </aside>
          <section className="results" aria-label="测速结果">
            <div className="results-heading">
              <div>
                <span className={`status-pill phase-${view.phase}`}>
                  <span className="status-dot" />
                  {statusText[view.phase]}
                </span>
                <span className="run-progress">{view.runs.length ? `第 ${run?.index ?? 1} / ${view.config?.runs ?? 1} 轮` : "准备好后，开始一次测试"}</span>
              </div>
              <span className="protocol-label">{view.config ? `${view.config.provider.toUpperCase()} · ${run?.model ?? view.config.model}` : "STREAM BENCHMARK"}</span>
            </div>
            <div className="metric-grid">
              {[{ label: "首字延迟", value: formatMs(run?.ttftMs), hint: "请求发出 → 首段可见文本" }, { label: "平均输出速度", value: run ? formatNumber(run.averageTps) : "—", unit: "tok/s", hint: "含首字等待的平均速度" }, { label: "输出 Token", value: run ? formatNumber(run.outputTokens, 0) : "—", hint: run?.tokenSource === "provider" ? "服务端用量 · 不含推理" : "可见文本 · 本地估算" }, { label: "请求总耗时", value: formatMs(run?.elapsedMs), hint: run ? `初始化 ${formatMs(run.initMs)} · 单独计时` : "初始化与请求分别计时" }].map(item => (
                <div className="metric" key={item.label}>
                  <p>{item.label}</p>
                  <strong>
                    {item.value}
                    <small>{item.unit}</small>
                  </strong>
                  <span>{item.hint}</span>
                </div>
              ))}
            </div>
            <section className="panel chart-panel">
              <div className="panel-heading">
                <h2>输出速度</h2>
                <div className="chart-key">
                  <i />
                  {" "}
                  可见文本 TPS
                  {" "}
                  <span>估算</span>
                </div>
              </div>
              <Curve run={run} />
              <div className="chart-footer">
                <span>
                  纯输出阶段
                  <b>
                    {formatNumber(run?.generationTps)}
                    {" "}
                    tok/s
                  </b>
                </span>
                <span>
                  单秒峰值
                  <b>
                    {run ? formatNumber(run.peakTps, 0) : "—"}
                    {" "}
                    tokens
                  </b>
                </span>
                <span>分块到达时间，不代表逐 Token 生成时间</span>
              </div>
            </section>
            <section className="panel output-panel">
              <div className="panel-heading">
                <h2>
                  实时输出
                  <span className="stream-caret" hidden={!active} />
                </h2>
                <span className="small-label">{run?.usage?.reasoningTokens !== undefined ? `推理用量 ${formatNumber(run.usage.reasoningTokens, 0)} tokens` : "TEXT STREAM"}</span>
              </div>
              {run?.error && <div className="run-error" role="alert">{run.error}</div>}
              <pre ref={outputRef} className={run?.text ? "" : "empty-output"}>{run?.text || (active ? "正在等待模型输出…" : "每一段输出，都留下时间刻度。\n开始测速后，模型回答会实时显示在这里。")}</pre>
              <div className="output-footer">
                <span>{run?.usage?.inputTokens !== undefined ? `输入 ${formatNumber(run.usage.inputTokens, 0)} · 缓存 ${formatNumber(run.usage.cachedInputTokens ?? 0, 0)} tokens` : "输出仅保存在当前电脑"}</span>
                <span>
                  {run?.text.length ?? 0}
                  {" "}
                  字符
                </span>
              </div>
            </section>
            <section className="panel table-panel">
              <div className="panel-heading">
                <h2>
                  多轮结果
                  <span className="count-badge">{view.runs.length}</span>
                </h2>
                <div className="export-actions">
                  <button onClick={() => importRef.current?.click()}>导入</button>
                  {(["json", "csv", "html"] as const).map(format => (
                    <button key={format} disabled={!view.runs.length || (active && !savedView)} onClick={() => downloadReport(view, format)}>
                      {format.toUpperCase()}
                      {" "}
                      ↗
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>轮次</th>
                      <th>状态</th>
                      <th>首字延迟</th>
                      <th>平均 tok/s</th>
                      <th>输出 Token</th>
                      <th>总耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.runs.map(item => (
                      <tr key={item.index} className={run?.index === item.index ? "selected-row" : ""}>
                        <td>
                          <button onClick={() => setSelectedRun(item.index)}>
                            {`#${String(item.index).padStart(2, "0")}`}
                          </button>
                        </td>
                        <td><span className={`table-status phase-${item.status}`}>{statusText[item.status]}</span></td>
                        <td>{formatMs(item.ttftMs)}</td>
                        <td>{formatNumber(item.averageTps)}</td>
                        <td>
                          {formatNumber(item.outputTokens, 0)}
                          {item.tokenSource === "estimated" ? " ≈" : ""}
                        </td>
                        <td>{formatMs(item.elapsedMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!view.runs.length && <p className="table-empty">还没有测试结果。可先查看示例，了解各项指标。</p>}
              </div>
              <div className="summary-row">
                <span>
                  成功
                  <b>{stats.count}</b>
                  {" "}
                  轮
                </span>
                <span>
                  TTFT P50
                  <b>{formatMs(stats.p50)}</b>
                </span>
                <span>
                  TTFT P95
                  <b>{formatMs(stats.p95)}</b>
                </span>
                <span>
                  平均
                  <b>
                    {formatNumber(stats.average)}
                    {" "}
                    tok/s
                  </b>
                </span>
              </div>
            </section>
          </section>
        </div>
        <section className="history-section">
          <div className="panel-heading">
            <button className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? "▾" : "▸"}
              {" "}
              本地历史
              {" "}
              <span>{history.length}</span>
            </button>
            <small>最多保留 6 份 · 不跨设备同步</small>
          </div>
          {showHistory && (
            <div className="history-list">
              {history.length
                ? history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSavedView(item);
                        setSelectedRun(undefined);
                      }}
                    >
                      <span>
                        {item.config?.provider.toUpperCase()}
                        {" "}
                        <b>{item.config?.model}</b>
                      </span>
                      <small>
                        {item.startedAt && new Date(item.startedAt).toLocaleString()}
                        {" "}
                        ·
                        {" "}
                        {summary(item.runs).count}
                        {" "}
                        轮成功
                      </small>
                    </button>
                  ))
                : <p>完成测速后，报告会保存在这里。</p>}
              {history.length > 0 && (
                <button
                  className="clear-history"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem(HISTORY_KEY);
                  }}
                >
                  清空本地历史
                </button>
              )}
            </div>
          )}
        </section>
      </main>
      <footer>
        <span>Token Speed Studio</span>
        <span>同一模型、提示词、推理强度，才是有意义的比较。</span>
        <a href={siteInfo.sourceUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>
      <input
        ref={importRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          try {
            if (file) {
              setSavedView(parseReport(await file.text()));
              setSelectedRun(undefined);
            }
          }
          catch (error) {
            setNotice(message(error));
          }
          event.target.value = "";
        }}
      />
      {modal === "connect" && (
        <Dialog title={desktop ? "连接到公开网页" : "连接本机软件"} close={() => setModal(undefined)}>
          {desktop
            ? (
                <>
                  <p>在网页输入以下配对码，再回到软件确认连接。配对码 5 分钟有效。</p>
                  <div className="pair-code">{pairing?.code ?? "正在准备…"}</div>
                  <p className="pair-port">
                    本机端口
                    <b>{pairing?.port ?? "—"}</b>
                  </p>
                  {pairing?.error && <p className="run-error">{pairing.error}</p>}
                  <button className="primary-button" onClick={() => void desktop?.openSite()}>打开公开网页 ↗</button>
                </>
              )
            : (
                <>
                  <ol className="steps">
                    <li>启动 Token Speed Studio 桌面软件。</li>
                    <li>点击软件右上角「本机运行」，查看配对码。</li>
                    <li>填写下方信息，再到软件窗口确认连接。</li>
                  </ol>
                  <label className="field-label" htmlFor="pair-code">8 位配对码</label>
                  <input id="pair-code" inputMode="numeric" maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} placeholder="00000000" />
                  <label className="field-label" htmlFor="port">本机端口</label>
                  <input id="port" type="number" value={port} onChange={event => setPort(event.target.value)} />
                  <p className="privacy-note">浏览器提示访问本地网络时，请选择允许。账号凭证不会上传到网站。</p>
                  <button className="primary-button" disabled={pending || code.length !== 8} onClick={() => void connect()}>{pending ? "请在桌面软件中确认…" : "连接并配对"}</button>
                  {connected && (
                    <button
                      className="text-button full"
                      onClick={() => void disconnect().then(() => {
                        setConnected(false);
                        setInfo(undefined);
                        setModal(undefined);
                      })}
                    >
                      断开当前连接
                    </button>
                  )}
                </>
              )}
          {notice && <p className="run-error" role="alert">{notice}</p>}
        </Dialog>
      )}
      {modal === "downloads" && (
        <Dialog title="桌面版 · 同一个测速工作台" close={() => setModal(undefined)}>
          <p>
            桌面版可以独立测速，也负责让网页连接本机 Codex。使用前请安装 Codex CLI，并运行
            <code>codex login</code>
            。
          </p>
          <div className="download-grid">
            {[{ name: "macOS", detail: "Apple Silicon / Intel", os: "mac" }, { name: "Windows", detail: "x64 · 安装程序", os: "win" }, { name: "Linux", detail: "x64 · AppImage / deb", os: "linux" }].map(target => (
              <div className="download-card" key={target.os}>
                <h3>{target.name}</h3>
                <p>{target.detail}</p>
                {(downloads.artifacts as { os: string; name: string; url: string }[]).filter(artifact => artifact.os === target.os).map(artifact => (
                  <a key={artifact.name} href={artifact.url} download>
                    {artifact.name}
                    {" "}
                    ↓
                  </a>
                ))}
                {!(downloads.artifacts as { os: string }[]).some(artifact => artifact.os === target.os) && <span className="download-pending">安装包尚未发布</span>}
              </div>
            ))}
          </div>
          <p className="privacy-note">首版安装包未签名。源码中提供三平台构建命令，测试结果以实际环境验收为准。</p>
          <a className="source-link" href={siteInfo.sourceUrl} target="_blank" rel="noreferrer">查看项目源码 ↗</a>
        </Dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
