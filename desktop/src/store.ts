// 사용자 데이터 저장: 탭 세션, 북마크, 방문 기록 (%APPDATA%/Kong Browser/*.json)
// 모두 이 PC 에만 저장되고 서버로 보내지 않는다.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { Bookmark, HistoryEntry } from "./shared.js";

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

export interface Session {
  tabs: string[];
  active: number;
}
export const loadSession = (): Session => readJson<Session>("session.json", { tabs: [], active: 0 });
export const saveSession = (s: Session) => writeLater("session.json", s);

// ---------- 북마크 ----------

let bookmarks: Bookmark[] | null = null;
export function listBookmarks(): Bookmark[] {
  bookmarks ??= readJson<Bookmark[]>("bookmarks.json", []);
  return bookmarks;
}
export const isBookmarked = (url: string) => listBookmarks().some((b) => b.url === url);
export function addBookmark(b: Omit<Bookmark, "createdAt">) {
  if (isBookmarked(b.url)) return;
  listBookmarks().push({ ...b, createdAt: Date.now() });
  writeLater("bookmarks.json", bookmarks);
}
export function removeBookmark(url: string) {
  bookmarks = listBookmarks().filter((b) => b.url !== url);
  writeLater("bookmarks.json", bookmarks);
}

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
