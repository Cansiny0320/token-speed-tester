import type { BenchmarkConfig, BenchmarkSnapshot, DesktopAPI, StudioInfo } from "./protocol";

declare global { interface Window { tokenSpeedDesktop?: DesktopAPI } }
const SESSION_KEY = "token-speed-connection-v1";
export const desktop = window.tokenSpeedDesktop;
let session: { token: string; port: number } | undefined;
try {
  const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  if (value && typeof value.token === "string" && Number.isInteger(value.port) && value.port > 0 && value.port < 65536) session = value;
}
catch { /* Private browsing may disable storage. */ }
export function hasConnection(): boolean {
  return !!desktop || !!session;
}
async function request<T>(route: string, method = "GET", body?: unknown, connection = session): Promise<T> {
  if (!connection) throw new Error("请先连接本机软件。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), route === "/info" || route === "/pair" ? 60000 : 10000);
  try {
    const response = await fetch(`http://127.0.0.1:${connection.port}${route}`, {
      method,
      signal: controller.signal,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && route !== "/pair") clearConnection();
      throw new Error(typeof result.error === "string" ? result.error : `请求失败（${response.status}）。`);
    }
    return result as T;
  }
  catch (error) {
    if (error instanceof TypeError || controller.signal.aborted) throw new Error("无法连接本机软件。请确认软件已启动、端口正确，并允许浏览器访问本地网络；也可直接在桌面版中测速。");
    throw error;
  }
  finally {
    clearTimeout(timer);
  }
}
export async function pair(code: string, port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("请输入 1–65535 之间的端口。");
  const result = await request<{ token: string }>("/pair", "POST", { code }, { token: "", port });
  session = { token: result.token, port };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  catch { /* Keep the active session in memory. */ }
}
function clearConnection() {
  session = undefined;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  }
  catch { /* Storage unavailable. */ }
}
export async function disconnect() {
  try {
    if (session) await request("/disconnect", "POST", {});
  }
  finally {
    clearConnection();
  }
}
export const getInfo = () => desktop ? desktop.info() : request<StudioInfo>("/info");
export const getState = () => desktop ? desktop.state() : request<BenchmarkSnapshot>("/state");
export const startRun = (config: BenchmarkConfig) => desktop ? desktop.run(config) : request<BenchmarkSnapshot>("/run", "POST", config);
export const cancelRun = () => desktop ? desktop.cancel() : request<void>("/cancel", "POST", {});
