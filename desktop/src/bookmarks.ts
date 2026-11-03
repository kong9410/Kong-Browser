// 북마크와 폴더 데이터 조작 (Electron 없는 순수 함수, 저장은 store.ts)
// 폴더는 한 단계 (북마크 바 바로 아래). folder 가 null 인 북마크는 북마크 바에 바로 놓인다.
import type { Bookmark, BookmarkData, BookmarkFolder } from "./shared.js";

export const emptyBookmarks = (): BookmarkData => ({ folders: [], bookmarks: [] });

/** 저장 파일 읽기: 폴더가 생기기 전 형식(북마크 배열)도 받아들인다 */
export function migrate(raw: unknown): BookmarkData {
  if (Array.isArray(raw)) return { folders: [], bookmarks: raw.map((b) => ({ folder: null, ...b })) };
  if (raw && typeof raw === "object" && Array.isArray((raw as BookmarkData).bookmarks))
    return { folders: (raw as BookmarkData).folders ?? [], bookmarks: (raw as BookmarkData).bookmarks };
  return emptyBookmarks();
}

export const find = (d: BookmarkData, url: string) => d.bookmarks.find((b) => b.url === url);

export function add(d: BookmarkData, b: Omit<Bookmark, "createdAt" | "folder"> & { folder?: string | null }, now = Date.now()) {
  if (find(d, b.url)) return;
  d.bookmarks.push({ ...b, folder: b.folder ?? null, createdAt: now });
}

export function remove(d: BookmarkData, url: string) {
  d.bookmarks = d.bookmarks.filter((b) => b.url !== url);
}

/** 다른 폴더로 옮기기 (null = 북마크 바). 없는 폴더면 무시 */
export function move(d: BookmarkData, url: string, folder: string | null) {
  const b = find(d, url);
  if (!b || (folder !== null && !d.folders.some((f) => f.id === folder))) return;
  b.folder = folder;
}

export function rename(d: BookmarkData, url: string, title: string) {
  const b = find(d, url);
  if (b && title.trim()) b.title = title.trim();
}

/** 새 폴더. 이름이 비어 있으면 만들지 않는다 */
export function addFolder(d: BookmarkData, name: string, id: string, now = Date.now()): BookmarkFolder | null {
  const n = name.trim();
  if (!n) return null;
  const f = { id, name: n, createdAt: now };
  d.folders.push(f);
  return f;
}

export function renameFolder(d: BookmarkData, id: string, name: string) {
  const f = d.folders.find((x) => x.id === id);
  if (f && name.trim()) f.name = name.trim();
}

/** 폴더 삭제: 안에 있던 북마크는 지우지 않고 북마크 바로 꺼낸다 */
export function removeFolder(d: BookmarkData, id: string) {
  d.folders = d.folders.filter((f) => f.id !== id);
  for (const b of d.bookmarks) if (b.folder === id) b.folder = null;
}

export const folderName = (d: BookmarkData, id: string | null) => (id ? d.folders.find((f) => f.id === id)?.name : undefined);

/** 화면에 그릴 모양: 북마크 바 바로 아래 북마크 + 폴더별 북마크 (각각 추가한 순서) */
export function tree(d: BookmarkData) {
  return {
    root: d.bookmarks.filter((b) => !b.folder),
    folders: d.folders.map((folder) => ({ folder, bookmarks: d.bookmarks.filter((b) => b.folder === folder.id) })),
  };
}
