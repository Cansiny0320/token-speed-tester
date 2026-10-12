import type { HistoryGroup, HistoryState } from "./protocol";
import { useEffect, useState } from "react";
import { downloadHistory, historyRange, recentHistoryDates } from "./history-reports";
import { formatMs, formatNumber } from "./reports";
import { cancelHistory, getHistoryState, startHistory } from "./transport";

const idle: HistoryState = { id: "", phase: "idle", progress: { filesTotal: 0, filesRead: 0, bytesTotal: 0, bytesRead: 0 }, report: null };
const phases = { idle: "尚未扫描", scanning: "正在扫描", completed: "扫描完成", cancelled: "已取消 · 部分结果", failed: "扫描失败 · 部分结果" };
const setting = (value: string) => value === "unknown" ? "未知" : value === "mixed" ? "轮内混用" : value;
const groupId = (value: Pick<HistoryGroup, "model" | "effort" | "serviceTier">) => JSON.stringify([value.model, value.effort, value.serviceTier]);
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "历史分析未完成，请重试。";

export function HistoryView({ connected, benchmarkActive, onScanningChange, connect }: { connected: boolean; benchmarkActive: boolean; onScanningChange: (busy: boolean) => void; connect: () => void }) {
  const [dates, setDates] = useState(recentHistoryDates);
  const [state, setState] = useState<HistoryState>(idle);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState("all");
  const [page, setPage] = useState(0);
  const scanning = state.phase === "scanning";
  const report = state.report;
  const overall = report?.summary;
  const filtered = report?.turns.filter(t => selected === "all" || groupId(t) === selected) ?? [];
  const visible = filtered.slice(page * 50, (page + 1) * 50);
  useEffect(() => {
    onScanningChange(scanning);
  }, [scanning, onScanningChange]);
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getHistoryState();
        if (stopped) return;
        setState(next);
        if (next.phase === "scanning") timer = setTimeout(poll, 750);
      }
      catch (error) {
        if (!stopped) setError(errorMessage(error));
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected, state.id]);
  async function begin() {
    setPending(true);
    setError("");
    try {
      setState(await startHistory(historyRange(dates.from, dates.to)));
      setSelected("all");
      setPage(0);
    }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function cancel() {
    try {
      await cancelHistory();
    }
    catch (error) { setError(errorMessage(error)); }
  }
  const progress = state.progress;
  const percent = progress.bytesTotal ? Math.min(100, progress.bytesRead / progress.bytesTotal * 100) : 0;
  return (
    <div className="history-analysis">
      <section className="panel history-controls" aria-label="历史分析日期范围">
        <div className="history-intro">
          <h2>从日常会话中观察速度与用量</h2>
          <p>读取本机 Codex 会话与归档，不调用模型、不消耗额度。只展示统计指标，正文留在本机。</p>
        </div>
        <div className="history-date-row">
          <label>
            开始日期
            <input type="date" value={dates.from} disabled={scanning || pending} onChange={e => setDates({ ...dates, from: e.target.value })} />
          </label>
          <span className="history-date-to">至</span>
          <label>
            结束日期
            <input type="date" value={dates.to} disabled={scanning || pending} onChange={e => setDates({ ...dates, to: e.target.value })} />
          </label>
          <div className="history-presets">{[1, 7, 30].map(days => <button key={days} disabled={scanning || pending} onClick={() => setDates(recentHistoryDates(days))}>{days === 1 ? "今天" : `近 ${days} 天`}</button>)}</div>
          {scanning
            ? <button className="stop-button" onClick={() => void cancel()}>取消扫描</button>
            : <button className="primary-button" disabled={!connected || benchmarkActive || pending} onClick={() => void begin()}>{pending ? "正在启动…" : "分析历史会话"}</button>}
        </div>
        {!connected && <button className="connect-hint" onClick={connect}>连接本机软件后读取历史统计 →</button>}
        {benchmarkActive && <p className="measurement-note">主动测速结束后可以开始扫描，避免读取与分词影响计时。</p>}
      </section>
      {error && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭历史分析提示">×</button>
        </div>
      )}
      <div className="history-progress" aria-live="polite">
        <div>
          <strong>{phases[state.phase]}</strong>
          <span>{state.id ? `${progress.filesRead} / ${progress.filesTotal} 个文件 · ${formatNumber(progress.bytesRead / 1048576)} MB` : "选择日期后开始扫描"}</span>
        </div>
        <progress value={percent} max={100} aria-label="历史扫描进度" />
        {scanning && <small>按文件快照读取，正在写入的尾行会在下次扫描补齐。</small>}
        {state.error && <p role="alert">{state.error}</p>}
      </div>
      {report && (
        <>
          <div className="history-range-label">
            本次结果：
            {dateTime(report.range.from)}
            {" "}
            —
            {dateTime(new Date(Date.parse(report.range.to) - 1).toISOString())}
            {" "}
            · 按事件时间统计
          </div>
          <div className="metric-grid">
            {[
              { label: "会话 / 轮次", value: `${new Set(report.turns.map(t => t.sessionId)).size} / ${overall?.turns}`, hint: `${overall?.completed} 轮已完成 · ${overall?.usageTurns} 轮有用量` },
              { label: "输入 / 缓存比例", value: formatNumber(overall?.usage.inputTokens, 0), hint: `缓存 ${overall?.cacheRatio == null ? "未知" : `${formatNumber(overall.cacheRatio * 100)}%`}` },
              { label: "输出 Token", value: formatNumber(overall?.usage.outputTokens, 0), hint: `其中推理 ${formatNumber(overall?.usage.reasoningTokens, 0)} · 含工具参数等输出` },
              { label: "模型首 token 等待 P50", value: formatMs(overall?.modelTtftMs.p50), hint: `${overall?.modelTtftMs.count} 个完整轮次样本 · 不等同可见首字` },
            ].map(metric => (
              <div className="metric" key={metric.label}>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                <span>{metric.hint}</span>
              </div>
            ))}
          </div>
          <section className="panel table-panel">
            <div className="panel-heading">
              <h2>按模型、推理强度与服务档位分组</h2>
              <div className="export-actions">
                {(["json", "csv"] as const).map(format => (
                  <button key={format} disabled={scanning} onClick={() => downloadHistory(state, format)}>
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
                    <th>模型 / 强度 / 档位</th>
                    <th>完成 / 全部轮次</th>
                    <th>输入 / 输出 Token</th>
                    <th>模型首 token P50 / P95</th>
                    <th>整轮耗时 P50</th>
                    <th>消息速度 P50（估算）</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.map(g => (
                    <tr key={groupId(g)}>
                      <td>
                        <button onClick={() => {
                          setSelected(groupId(g));
                          setPage(0);
                        }}
                        >
                          {setting(g.model)}
                        </button>
                        <small className="history-cell-note">
                          {setting(g.effort)}
                          {" "}
                          ·
                          {" "}
                          {setting(g.serviceTier)}
                        </small>
                      </td>
                      <td>
                        {g.completed}
                        {" "}
                        /
                        {" "}
                        {g.turns}
                      </td>
                      <td>
                        {formatNumber(g.usage.inputTokens, 0)}
                        {" "}
                        /
                        {" "}
                        {formatNumber(g.usage.outputTokens, 0)}
                      </td>
                      <td>
                        {formatMs(g.modelTtftMs.p50)}
                        {" "}
                        /
                        {" "}
                        {formatMs(g.modelTtftMs.p95)}
                        <small className="history-cell-note">
                          {g.modelTtftMs.count}
                          {" "}
                          个样本
                        </small>
                      </td>
                      <td>
                        {formatMs(g.durationMs.p50)}
                        <small className="history-cell-note">含工具与等待</small>
                      </td>
                      <td>
                        {formatNumber(g.estimatedMessageTps.p50)}
                        {" "}
                        tok/s
                        <small className="history-cell-note">
                          {g.estimatedMessageTps.count}
                          {" "}
                          条消息
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.turns.length && <p className="table-empty">该日期范围内没有可分析的会话。可扩大日期范围，或确认本机 Codex 已保存会话日志。</p>}
            <p className="history-method">消息速度 = 本地估算 Token / 消息生命周期，受分词编码与消息边界影响；没有逐段到达数据，不生成历史 TPS 曲线。不同任务、上下文、缓存和档位的结果不用于直接排名。</p>
          </section>
          <section className="history-coverage" aria-label="历史数据覆盖说明">
            <strong>数据覆盖</strong>
            <span>
              读取
              {report.coverage.filesRead}
              {" "}
              个文件 ·
              {report.coverage.filesSkippedByTime}
              {" "}
              个文件早于所选范围 · 去重
              {report.coverage.duplicateRecords}
              {" "}
              条
            </span>
            <span>
              缺失用量
              {report.coverage.missingUsageTurns}
              {" "}
              轮 · 无有效消息计时
              {report.coverage.untimedMessages}
              {" "}
              条 · 累计重置
              {report.coverage.legacyCounterResets}
              {" "}
              次
            </span>
            <span>
              读取失败
              {report.coverage.unreadableFiles}
              {" "}
              个文件 · 损坏行
              {report.coverage.malformedLines}
              {" "}
              · 未完整尾行
              {report.coverage.incompleteLines}
              {" "}
              · 超长记录
              {report.coverage.oversizedLines}
              {" "}
              · 无法归属用量
              {report.coverage.skippedUsageEvents}
              {" "}
              条
            </span>
            {state.phase !== "completed" && <span className="history-partial">当前为部分结果，请完成扫描后再比较。</span>}
          </section>
          <section className="panel table-panel">
            <div className="panel-heading">
              <h2>
                会话轮次明细
                <span className="count-badge">{filtered.length}</span>
              </h2>
              <select
                className="history-group-select"
                aria-label="筛选历史分组"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">全部分组</option>
                {report.groups.map(g => (
                  <option key={groupId(g)} value={groupId(g)}>
                    {setting(g.model)}
                    {" "}
                    ·
                    {" "}
                    {setting(g.effort)}
                    {" "}
                    ·
                    {" "}
                    {setting(g.serviceTier)}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>会话 / 轮次 ID</th>
                    <th>时间 / 状态</th>
                    <th>模型 / 强度 / 档位</th>
                    <th>请求 / 用量来源</th>
                    <th>输出 / 推理 Token</th>
                    <th>模型首 token / 整轮耗时</th>
                    <th>可见消息估算</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(t => (
                    <tr key={t.turnId}>
                      <td title={`${t.sessionId} / ${t.turnId}`}>
                        {t.sessionId.slice(0, 8)}
                        <small className="history-cell-note">{t.turnId.slice(0, 8)}</small>
                      </td>
                      <td>
                        {dateTime(t.completedAt ?? t.startedAt)}
                        <small className="history-cell-note">
                          {t.status === "completed" ? "已完成" : t.status === "interrupted" ? "已中断" : "未完成"}
                          {t.partial ? " · 跨范围" : ""}
                        </small>
                      </td>
                      <td>
                        {setting(t.model)}
                        <small className="history-cell-note">
                          {setting(t.effort)}
                          {" "}
                          ·
                          {" "}
                          {setting(t.serviceTier)}
                        </small>
                      </td>
                      <td>
                        {t.requests}
                        <small className="history-cell-note">{t.usageSource === "request" ? "逐请求记录" : t.usageSource === "legacy" ? "旧版累计差分" : "用量缺失"}</small>
                      </td>
                      <td>
                        {formatNumber(t.usage.outputTokens, 0)}
                        {" "}
                        /
                        {" "}
                        {formatNumber(t.usage.reasoningTokens, 0)}
                      </td>
                      <td>
                        {formatMs(t.modelTtftMs)}
                        {" "}
                        /
                        {" "}
                        {formatMs(t.durationMs)}
                      </td>
                      <td>
                        {t.messages.length}
                        {" "}
                        条
                        <small className="history-cell-note">{[...new Set(t.messages.map(m => `${m.encoding}${m.encodingSource === "fallback" ? "（回退）" : ""}`))].join(" / ") || "无正文记录"}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="history-pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
              <span>
                {page + 1}
                {" "}
                /
                {" "}
                {Math.max(1, Math.ceil(filtered.length / 50))}
              </span>
              <button disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>下一页</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
