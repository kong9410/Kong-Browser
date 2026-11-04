// 툴바 preload: 툴바 화면에 필요한 최소한의 API 만 노출한다.
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type BrowserState, type Rect } from "./shared";
import type { Suggestion } from "./suggest";

const api = {
  /** 운영체제 (darwin = macOS: 창 버튼이 탭 줄 왼쪽) */
  platform: process.platform,
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
  tabDragEnd: (id: number) => ipcRenderer.send(IPC.tabDragEnd, id),
  openUrl: (url: string, where: "current" | "tab" | "background") => ipcRenderer.send(IPC.openUrl, url, where),
  tabMenu: (id: number) => ipcRenderer.send(IPC.tabMenu, id),
  toggleMute: (id: number) => ipcRenderer.send(IPC.toggleMute, id),
  zoomReset: () => ipcRenderer.send(IPC.zoomReset),
  toggleBookmark: () => ipcRenderer.send(IPC.toggleBookmark),
  bookmarkMenu: (url: string) => ipcRenderer.send(IPC.bookmarkMenu, url),
  openHistory: () => ipcRenderer.send(IPC.openHistory),
  openSettings: () => ipcRenderer.send(IPC.openSettings),
  toggleDock: () => ipcRenderer.send(IPC.toggleDock),
  openBookmarks: () => ipcRenderer.send(IPC.openBookmarks),
  downloadsMenu: (at: Rect) => ipcRenderer.send(IPC.downloadsMenu, at),
  starMenu: (at: Rect) => ipcRenderer.send(IPC.starMenu, at),
  folderMenu: (id: string, at: Rect) => ipcRenderer.send(IPC.folderMenu, id, at),
  /** 자동완성: 후보를 계산해 목록 창에 띄우고, 후보를 돌려받는다 (Enter 처리용) */
  suggest: (text: string, at: Rect) => ipcRenderer.invoke(IPC.suggest, text, at) as Promise<Suggestion[]>,
  suggestSelect: (i: number) => ipcRenderer.send(IPC.suggestSelect, i),
  suggestHide: () => ipcRenderer.send(IPC.suggestHide),
  /** 페이지 영역 위치: 툴바 높이(top), 오른쪽 dock 폭(right) */
  setLayout: (box: { top: number; right: number }) => ipcRenderer.send(IPC.layout, box),
  ready: () => ipcRenderer.send(IPC.ready),
  onState: (fn: (s: BrowserState) => void) => ipcRenderer.on(IPC.state, (_e, s) => fn(s)),
  /** keep: 이미 주소창에 커서가 있으면 그대로 (입력 중인 글자를 선택하지 않음) */
  onAddressDone: (fn: (url: string) => void) => ipcRenderer.on(IPC.addressDone, (_e, url: string) => fn(url)),
  onFocusAddress: (fn: (keep: boolean) => void) => ipcRenderer.on(IPC.focusAddress, (_e, keep) => fn(!!keep)),
};

export type KongUI = typeof api;
contextBridge.exposeInMainWorld("kongUI", api);
