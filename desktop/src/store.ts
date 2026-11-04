// 사용자 데이터 저장: 탭 세션, 북마크, 방문 기록, 다운로드 내역 (%APPDATA%/Kong Browser/*.json)
// 모두 이 PC 에만 저장되고 서버로 보내지 않는다.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import * as bm from "./bookmarks.js";
import type { BookmarkData, HistoryEntry } from "./shared.js";
import { parseSession, type Session } from "./windows.js";

const file = (name: string) => path.join(app.getPath("userData"), name);

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** 자주 바뀌는 데이터는 모아서 저장 (0.5초). 앱이 끝날 때는 flush 로 바로 */
const pending = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;
function writeLater(name: string, data: unknown) {
  pending.set(name, data);
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}
export function flush() {
  clearTimeout(timer);
  for (const [name, data] of pending) fs.writeFileSync(file(name), JSON.stringify(data, null, 1));
  pending.clear();
}

// ---------- 탭 세션 (다시 실행하면 복원) ----------

/** 창마다 탭들 (예전 형식 {tabs, active} 도 읽음, windows.ts) */
export const loadSession = (): Session => parseSession(readJson<unknown>("session.json", null));
export const saveSession = (s: Session) => writeLater("session.json", s);

// ---------- 북마크 (폴더 포함, 조작 로직은 bookmarks.ts) ----------

let bookmarks: BookmarkData | null = null;
export function bookmarkData(): BookmarkData {
  bookmarks ??= bm.migrate(readJson<unknown>("bookmarks.json", null));
  return bookmarks;
}
/** 바꾸는 함수를 받아 실행하고 저장 */
export function editBookmarks(fn: (d: BookmarkData) => void) {
  fn(bookmarkData());
  writeLater("bookmarks.json", bookmarks);
}
export const isBookmarked = (url: string) => !!bm.find(bookmarkData(), url);
export const newFolderId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- 방문 기록 ----------

const HISTORY_MAX = 5000;
let history: HistoryEntry[] | null = null;
function allHistory(): HistoryEntry[] {
  history ??= readJson<HistoryEntry[]>("history.json", []);
  return history;
}
/** 새 방문 (최신이 앞). 같은 주소를 연달아 방문하면(새로고침 등) 시각만 갱신 */
export function addVisit(url: string, title: string) {
  const h = allHistory();
  if (h[0]?.url === url) h[0].at = Date.now();
  else h.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, url, title, at: Date.now() });
  if (h.length > HISTORY_MAX) h.length = HISTORY_MAX;
  writeLater("history.json", h);
}
/** 제목은 페이지가 뜬 뒤에 알게 되므로, 가장 최근 그 주소 방문의 제목을 채운다 */
export function setVisitTitle(url: string, title: string) {
  const e = allHistory().find((x) => x.url === url);
  if (e && e.title !== title) {
    e.title = title;
    writeLater("history.json", history);
  }
}
/** 읽은 글 표시용: 이 호스트의 방문 주소 */
export const visitedOn = (host: string): string[] =>
  host ? allHistory().filter((e) => e.url.startsWith(`https://${host}/`) || e.url.startsWith(`http://${host}/`)).map((e) => e.url) : [];

/** 자동완성용: 전체 기록 */
export const historyEntries = (): readonly HistoryEntry[] => allHistory();

export function searchHistory(query = "", limit = 500): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  const h = allHistory();
  return (q ? h.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)) : h).slice(0, limit);
}
export function removeVisit(id: string) {
  history = allHistory().filter((e) => e.id !== id);
  writeLater("history.json", history);
}
export function clearHistory() {
  history = [];
  writeLater("history.json", history);
}

// ---------- 다운로드 내역 ----------
// 목록 자체는 main.ts 가 들고 있고(진행 중 상태 포함), 여기서는 읽기·저장만

// ---------- 사이트 권한·확대/축소 (사이트별로 기억) ----------

export const loadPermissions = (): unknown => readJson<unknown>("permissions.json", {});
export const savePermissions = (p: unknown) => writeLater("permissions.json", p);
export const loadZoom = (): unknown => readJson<unknown>("zoom.json", {});
export const saveZoom = (z: unknown) => writeLater("zoom.json", z);

export const loadDownloads = (): unknown => readJson<unknown>("downloads.json", []);
export const saveDownloads = (list: unknown) => writeLater("downloads.json", list);
