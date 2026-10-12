import type { IpcMainInvokeEvent } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { startBridge } from "../../../src/studio/bridge.js";
import { resolveCodex } from "../../../src/studio/codex.js";
import { BenchmarkRunner } from "../../../src/studio/runner.js";
import { isRecord } from "../../../src/studio/types.js";
import siteInfo from "../../site/src/site-info.json";

const runner = new BenchmarkRunner();
const pagePath = path.join(__dirname, "web", "index.html");
let window: BrowserWindow | undefined;
let bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
let quitting = false;
function external(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "https:") void shell.openExternal(url);
}
function createWindow() {
  window = new BrowserWindow({
    title: "Token Speed Studio",
    width: 1330,
    height: 1020,
    minWidth: 780,
    minHeight: 680,
    backgroundColor: "#101820",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== pathToFileURL(pagePath).href) {
      event.preventDefault();
      external(url);
    }
  });
  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => {
    window = undefined;
  });
  void window.loadFile(pagePath);
}
function trusted(event: IpcMainInvokeEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url.split("#")[0] !== pathToFileURL(pagePath).href) {
    throw new Error("只有本机软件界面可以调用此操作。");
  }
}
function handle(name: string, action: (value: unknown) => unknown) {
  ipcMain.handle(`studio:${name}`, (event, value: unknown) => {
    trusted(event);
    return action(value);
  });
}
async function initialize() {
  const settings = path.join(app.getPath("userData"), "settings.json");
  try {
    const value: unknown = JSON.parse(await readFile(settings, "utf8"));
    if (isRecord(value) && typeof value.codexPath === "string") runner.codexPath = value.codexPath;
  }
  catch { /* First launch has no saved executable path. */ }
  const options = {
    siteUrl: siteInfo.siteUrl,
    allowedOrigins: [siteInfo.siteUrl, ...(!app.isPackaged ? ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173"] : [])],
    approvePairing: async (origin: string) => {
      if (!window) createWindow();
      window?.show();
      window?.focus();
      const result = await dialog.showMessageBox(window!, {
        type: "question",
        title: "允许网页连接本机？",
        message: `允许 ${origin} 使用本机测速？`,
        detail: "该网页将可以启动、查看和取消 Codex/API 测速。Codex 登录凭证留在本机；测速会使用当前账号额度。",
        buttons: ["拒绝", "允许连接"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return result.response === 1;
    },
  };
  try {
    bridge = await startBridge(runner, options);
  }
  catch (error) {
    if (isRecord(error) && error.code === "EADDRINUSE") bridge = await startBridge(runner, { ...options, port: 0 });
    else throw error;
  }
  handle("info", () => runner.info());
  handle("state", () => runner.state());
  handle("run", value => runner.start(value));
  handle("cancel", () => runner.cancel());
  handle("pairing", () => bridge!.pairing());
  handle("open-site", () => external(siteInfo.siteUrl));
  handle("select-codex", async () => {
    if (["preparing", "running"].includes(runner.state().phase)) throw new Error("请先停止测速，再切换 Codex。");
    const result = await dialog.showOpenDialog(window!, { title: "选择 Codex 可执行文件或 npm 启动脚本", properties: ["openFile"] });
    if (result.canceled || !result.filePaths[0]) return false;
    await resolveCodex(result.filePaths[0]);
    runner.codexPath = result.filePaths[0];
    await writeFile(settings, JSON.stringify({ codexPath: runner.codexPath }, null, 2));
    return true;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]));
  createWindow();
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
else {
  app.on("second-instance", () => {
    if (!window) createWindow();
    window?.show();
    window?.focus();
  });
  app.whenReady().then(initialize).catch((error: unknown) => {
    dialog.showErrorBox("无法启动 Token Speed Studio", error instanceof Error ? error.message : "初始化失败。");
    app.quit();
  });
  app.on("activate", () => {
    if (!window && app.isReady()) createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (!quitting && bridge) {
      event.preventDefault();
      quitting = true;
      void bridge.close().finally(() => app.quit());
    }
  });
}
