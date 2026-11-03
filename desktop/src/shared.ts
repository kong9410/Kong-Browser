// main ↔ 툴바(UI) ↔ 페이지 preload 가 주고받는 메시지와 상태

export const IPC = {
  /** 페이지 preload → main (동기): 이 URL 에 쓸 레시피와 "원본 보기" 여부 */
  pageConfig: "kong:page-config",
  /** 페이지 preload → main: 엔진 판정 결과 (Status JSON) */
  pageStatus: "kong:page-status",
  /** 페이지 preload → main: 통일 화면의 왼쪽 메뉴를 접거나 펼침 (다음 페이지에서도 같은 상태로) */
  pageNav: "kong:page-nav",
  /** 툴바 → main */
  navigate: "ui:navigate",
  back: "ui:back",
  forward: "ui:forward",
  reload: "ui:reload",
  stop: "ui:stop",
  toggleOriginal: "ui:toggle-original",
  newTab: "ui:new-tab",
  closeTab: "ui:close-tab",
  selectTab: "ui:select-tab",
  moveTab: "ui:move-tab",
  /** 주소 열기: 지금 탭 / 새 탭 / 뒤쪽 새 탭 (북마크 바 등) */
  openUrl: "ui:open-url",
  toggleBookmark: "ui:toggle-bookmark",
  bookmarkMenu: "ui:bookmark-menu",
  /** ★ 를 눌렀을 때 (이미 북마크된 페이지): 폴더로 이동 / 삭제 / 관리 메뉴 */
  starMenu: "ui:star-menu",
  /** 북마크 바의 폴더를 눌렀을 때: 안의 북마크 메뉴 */
  folderMenu: "ui:folder-menu",
  openBookmarks: "ui:open-bookmarks",
  /** 주소창 자동완성: 툴바 → main (invoke, 후보 목록을 돌려받음) */
  suggest: "ui:suggest",
  suggestSelect: "ui:suggest-select",
  suggestHide: "ui:suggest-hide",
  /** 자동완성 목록 창 → main: 후보를 눌렀을 때 */
  suggestChoose: "suggest:choose",
  /** main → 자동완성 목록 창: 그릴 후보와 선택 위치 */
  suggestList: "suggest:list",
  openHistory: "ui:open-history",
  /** 앱 안쪽 페이지(시작 페이지, 방문 기록) → main: 기록·북마크 조회/삭제 (invoke) */
  internal: "kong:internal",
  /** 툴바 → main: 페이지 영역 위치 (툴바 높이, 오른쪽 dock 폭) */
  layout: "ui:layout",
  ready: "ui:ready",
  /** main → 툴바 */
  state: "ui:state",
  focusAddress: "ui:focus-address",
} as const;

export interface PageConfig {
  recipes: unknown[];
  /** true 면 이번 로드는 재배치하지 않음 (원본 보기) */
  off: boolean;
  /** 통일 화면의 왼쪽 메뉴를 펼친 채로 시작할지 (사용자가 마지막으로 고른 상태, 기본 펼침) */
  navOpen: boolean;
}

export interface Bookmark {
  url: string;
  title: string;
  favicon: string | null;
  createdAt: number;
  /** 들어 있는 폴더 id. null 이면 북마크 바에 바로 */
  folder: string | null;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
}

/** 북마크 저장 형식 (bookmarks.json) */
export interface BookmarkData {
  folders: BookmarkFolder[];
  bookmarks: Bookmark[];
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  at: number;
}

/** 앱 안쪽 페이지가 main 에 요청할 수 있는 것 */
export type InternalRequest =
  | { op: "history"; query?: string; limit?: number }
  | { op: "removeVisit"; id: string }
  | { op: "clearHistory" }
  | { op: "bookmarks" }
  | { op: "removeBookmark"; url: string }
  | { op: "renameBookmark"; url: string; title: string }
  | { op: "moveBookmark"; url: string; folder: string | null }
  | { op: "addFolder"; name: string }
  | { op: "renameFolder"; id: string; name: string }
  | { op: "removeFolder"; id: string };

/** 화면 위 사각형 (툴바 화면 기준 = 창 기준). 메뉴·자동완성 목록을 띄울 자리 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 탭 줄에 그릴 탭 하나 */
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  active: boolean;
}

/** 탭 하나의 상태 (툴바에는 지금 탭의 것이 보인다) */
export interface TabState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** 사용자가 이 페이지를 원본으로 보고 있음 */
  original: boolean;
  /** 이 사이트에 레시피가 있는지 (원본 보기 버튼 활성화용) */
  hasRecipe: boolean;
  /** 엔진 판정. 레시피가 없는 페이지면 null */
  verdict: "ok" | "degraded" | "broken" | "none" | null;
  failed: string[];
}

/** 툴바 화면에 보내는 상태: 지금 탭의 상태 + 탭 줄 + 북마크 */
export interface BrowserState extends TabState {
  tabs: TabInfo[];
  /** 지금 페이지가 북마크되어 있는지 (☆/★) */
  bookmarked: boolean;
  bookmarks: BookmarkData;
  /** 북마크 바 표시 (Ctrl+Shift+B, 기본 표시) */
  bookmarkBar: boolean;
}
