import type { DesktopAPI } from "../../../src/studio/types.js";
import { contextBridge, ipcRenderer } from "electron";

const api: DesktopAPI = {
  info: () => ipcRenderer.invoke("studio:info"),
  state: () => ipcRenderer.invoke("studio:state"),
  run: config => ipcRenderer.invoke("studio:run", config),
  cancel: () => ipcRenderer.invoke("studio:cancel"),
  pairing: () => ipcRenderer.invoke("studio:pairing"),
  selectCodex: () => ipcRenderer.invoke("studio:select-codex"),
  openSite: () => ipcRenderer.invoke("studio:open-site"),
  historyStart: config => ipcRenderer.invoke("studio:history-start", config),
  historyState: () => ipcRenderer.invoke("studio:history-state"),
  historyCancel: () => ipcRenderer.invoke("studio:history-cancel"),
};
contextBridge.exposeInMainWorld("tokenSpeedDesktop", api);
