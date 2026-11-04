// 앱 안쪽 페이지(시작 페이지, 방문 기록) 공용: preload-page 가 이 페이지에만 노출하는 API
import type { DownloadInfo } from "../downloads";
import type { BookmarkData, ClearWhat, DownloadAction, SettingsView, HistoryEntry, InternalRequest } from "../shared";

declare global {
  interface Window {
    kongInternal?: { call(req: InternalRequest): Promise<unknown> };
  }
}

const call = <T>(req: InternalRequest) => (window.kongInternal?.call(req) ?? Promise.resolve(null)) as Promise<T>;

export const internal = {
  history: (query = "", limit = 500) => call<HistoryEntry[]>({ op: "history", query, limit }),
  removeVisit: (id: string) => call<void>({ op: "removeVisit", id }),
  clearHistory: () => call<void>({ op: "clearHistory" }),
  bookmarks: () => call<BookmarkData>({ op: "bookmarks" }),
  removeBookmark: (url: string) => call<void>({ op: "removeBookmark", url }),
  renameBookmark: (url: string, title: string) => call<void>({ op: "renameBookmark", url, title }),
  moveBookmark: (url: string, folder: string | null) => call<void>({ op: "moveBookmark", url, folder }),
  addFolder: (name: string) => call<void>({ op: "addFolder", name }),
  renameFolder: (id: string, name: string) => call<void>({ op: "renameFolder", id, name }),
  removeFolder: (id: string) => call<void>({ op: "removeFolder", id }),
  downloads: (query = "") => call<(DownloadInfo & { exists: boolean })[]>({ op: "downloads", query }),
  downloadAction: (id: number, action: DownloadAction) => call<void>({ op: "downloadAction", id, action }),
  clearDownloads: () => call<void>({ op: "clearDownloads" }),
  openDownloadsFolder: () => call<void>({ op: "openDownloadsFolder" }),
  clearData: (since: number, what: ClearWhat) => call<void>({ op: "clearData", since, what }),
  settings: () => call<SettingsView>({ op: "settings" }),
  setSetting: (key: string, value: unknown) => call<SettingsView>({ op: "setSetting", key, value }),
  chooseDownloadDir: () => call<SettingsView>({ op: "chooseDownloadDir" }),
  setPermission: (origin: string, key: string, value: "allow" | "block" | null) => call<SettingsView>({ op: "setPermission", origin, key, value }),
  resetZoom: (host: string) => call<SettingsView>({ op: "resetZoom", host }),
};

export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 사이트 아이콘: 사이트 주소의 /favicon.ico 를 쓰고, 없으면 첫 글자 */
export function siteIcon(url: string, favicon?: string | null): HTMLElement {
  const box = el("span", "icon");
  const host = hostOf(url);
  const img = document.createElement("img");
  img.alt = "";
  img.src = favicon || `https://${host}/favicon.ico`;
  img.onerror = () => {
    img.remove();
    box.textContent = host.replace(/^www\./, "").charAt(0).toUpperCase();
  };
  box.appendChild(img);
  return box;
}
