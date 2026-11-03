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
  openHistory: "ui:open-history",
  /** 앱 안쪽 페이지(시작 페이지, 방문 기록) → main: 기록·북마크 조회/삭제 (invoke) */
  internal: "kong:internal",
  /** 툴바 → main: 페이지 영역이 시작할 위치 (툴바 높이) */
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
  | { op: "removeBookmark"; url: string };

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
  bookmarks: Bookmark[];
  /** 북마크 바 표시 (Ctrl+Shift+B, 기본 표시) */
  bookmarkBar: boolean;
}
