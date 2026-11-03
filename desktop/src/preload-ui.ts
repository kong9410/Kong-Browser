// 툴바 preload: 툴바 화면에 필요한 최소한의 API 만 노출한다.
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type BrowserState } from "./shared";

const api = {
  navigate: (text: string) => ipcRenderer.send(IPC.navigate, text),
  back: () => ipcRenderer.send(IPC.back),
  forward: () => ipcRenderer.send(IPC.forward),
  reload: () => ipcRenderer.send(IPC.reload),
  stop: () => ipcRenderer.send(IPC.stop),
  toggleOriginal: () => ipcRenderer.send(IPC.toggleOriginal),
  newTab: () => ipcRenderer.send(IPC.newTab),
  closeTab: (id: number) => ipcRenderer.send(IPC.closeTab, id),
  selectTab: (id: number) => ipcRenderer.send(IPC.selectTab, id),
  moveTab: (id: number, to: number) => ipcRenderer.send(IPC.moveTab, id, to),
  openUrl: (url: string, where: "current" | "tab" | "background") => ipcRenderer.send(IPC.openUrl, url, where),
  toggleBookmark: () => ipcRenderer.send(IPC.toggleBookmark),
  bookmarkMenu: (url: string) => ipcRenderer.send(IPC.bookmarkMenu, url),
  openHistory: () => ipcRenderer.send(IPC.openHistory),
  /** 페이지 영역이 시작할 위치 (툴바 높이) */
  setLayout: (box: { top: number }) => ipcRenderer.send(IPC.layout, box),
  ready: () => ipcRenderer.send(IPC.ready),
  onState: (fn: (s: BrowserState) => void) => ipcRenderer.on(IPC.state, (_e, s) => fn(s)),
  onFocusAddress: (fn: () => void) => ipcRenderer.on(IPC.focusAddress, () => fn()),
};

export type KongUI = typeof api;
contextBridge.exposeInMainWorld("kongUI", api);
