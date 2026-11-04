// main ↔ 툴바(UI) ↔ 페이지 preload 가 주고받는 메시지와 상태

export const IPC = {
  /** 페이지 preload → main (동기): 이 URL 에 쓸 레시피와 "원본 보기" 여부 */
  pageConfig: "kong:page-config",
  /** 페이지 preload → main: 엔진 판정 결과 (Status JSON) */
  pageStatus: "kong:page-status",
  /** 페이지 preload → main: 통일 화면의 왼쪽 메뉴를 접거나 펼침 (다음 페이지에서도 같은 상태로) */
  pageNav: "kong:page-nav",
  /** main → 페이지 preload: 사이트가 떠나기를 막음(beforeunload) → 나가기 확인 창을 띄움 */
  leaveAsk: "kong:leave-ask",
  /** 페이지 preload → main (invoke): 나가기를 골랐으니 막혔던 이동을 다시 (해 줬으면 true) */
  leaveGo: "kong:leave-go",
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
  /** 탭 끌기가 끝남 (탭 줄 밖에 놓았으면 새 창으로 떼어 냄) */
  tabDragEnd: "ui:tab-drag-end",
  /** 주소 열기: 지금 탭 / 새 탭 / 뒤쪽 새 탭 (북마크 바 등) */
  openUrl: "ui:open-url",
  toggleBookmark: "ui:toggle-bookmark",
  bookmarkMenu: "ui:bookmark-menu",
  /** ★ 를 눌렀을 때 (이미 북마크된 페이지): 폴더로 이동 / 삭제 / 관리 메뉴 */
  starMenu: "ui:star-menu",
  /** 북마크 바의 폴더를 눌렀을 때: 안의 북마크 메뉴 */
  folderMenu: "ui:folder-menu",
  openBookmarks: "ui:open-bookmarks",
  /** 툴바 다운로드 버튼 → main: 다운로드 목록 메뉴 */
  downloadsMenu: "ui:downloads-menu",
  /** 주소창 자동완성: 툴바 → main (invoke, 후보 목록을 돌려받음) */
  suggest: "ui:suggest",
  suggestSelect: "ui:suggest-select",
  suggestHide: "ui:suggest-hide",
  /** 자동완성 목록 창 → main: 후보를 눌렀을 때 */
  suggestChoose: "suggest:choose",
  /** main → 자동완성 목록 창: 그릴 후보와 선택 위치 */
  suggestList: "suggest:list",
  openHistory: "ui:open-history",
  /** 툴바의 설정 버튼 */
  openSettings: "ui:open-settings",
  /** 오른쪽 dock 보이기/숨기기 */
  toggleDock: "ui:toggle-dock",
  /** 앱 안쪽 페이지(시작 페이지, 방문 기록) → main: 기록·북마크 조회/삭제 (invoke) */
  internal: "kong:internal",
  /** 툴바 → main: 페이지 영역 위치 (툴바 높이, 오른쪽 dock 폭) */
  layout: "ui:layout",
  ready: "ui:ready",
  /** 탭 오른쪽 클릭 메뉴 (새로고침·복제·고정·음소거·닫기…) */
  tabMenu: "ui:tab-menu",
  /** 탭의 스피커 아이콘: 음소거 켜기/끄기 */
  toggleMute: "ui:toggle-mute",
  /** 주소창의 확대/축소 표시를 누름: 기본 크기(100%)로 */
  zoomReset: "ui:zoom-reset",
  /** 페이지 preload → main: 마우스 옆 버튼 뒤로/앞으로 (Windows 는 app-command 로 받음) */
  pageHistory: "kong:page-history",
  /** main → 페이지 preload: 링크에 마우스를 올렸을 때 왼쪽 아래에 보일 주소 ("" 이면 숨김) */
  linkStatus: "kong:link-status",
  /** main ↔ 페이지 위에 겹쳐 뜨는 작은 창(찾기 막대·권한 묻기) */
  overlayIn: "overlay:in",
  overlayOut: "overlay:out",
  /** main → 툴바 */
  state: "ui:state",
  focusAddress: "ui:focus-address",
  /** main → 툴바: 자동완성 목록에서 골라 이동함 → 주소창 입력을 끝내고 그 주소를 보임 */
  addressDone: "ui:address-done",
} as const;

export interface PageConfig {
  recipes: unknown[];
  /** true 면 이번 로드는 재배치하지 않음 (원본 보기) */
  off: boolean;
  /** 통일 화면의 왼쪽 메뉴를 펼친 채로 시작할지 (사용자가 마지막으로 고른 상태, 기본 펼침) */
  navOpen: boolean;
  /** 이 사이트(같은 호스트)의 방문 기록 주소. 목록에서 읽은 글 표시용 */
  visited: string[];
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
  | { op: "removeFolder"; id: string }
  | { op: "downloads"; query?: string }
  | { op: "downloadAction"; id: number; action: DownloadAction }
  | { op: "clearDownloads" }
  | { op: "openDownloadsFolder" }
  | { op: "clearData"; since: number; what: ClearWhat }
  | { op: "settings" }
  | { op: "setSetting"; key: string; value: unknown }
  | { op: "chooseDownloadDir" }
  | { op: "setPermission"; origin: string; key: string; value: "allow" | "block" | null }
  | { op: "resetZoom"; host: string };

/** 설정 페이지가 그릴 것 */
export interface SettingsView {
  settings: import("./settings").Settings;
  /** 운영체제의 다운로드 폴더 (설정에서 고른 폴더가 없을 때) */
  defaultDownloadDir: string;
  /** 지금 쓰는 다운로드 폴더 */
  downloadDir: string;
  engines: { id: string; name: string }[];
  /** 사이트별 권한: origin → [권한 키, 이름, 허용/차단] */
  permissions: { origin: string; site: string; items: { key: string; label: string; value: "allow" | "block" }[] }[];
  /** 사이트별 확대/축소 */
  zooms: { host: string; percent: string }[];
  version: string;
  /** 쿠키 시각 기록 등 앱 데이터 폴더 */
  dataDir: string;
}

/** 인터넷 사용 기록 삭제에서 고른 것 */
export interface ClearWhat {
  history: boolean;
  downloads: boolean;
  /** 쿠키·사이트 저장 데이터 (로그아웃됨) */
  cookies: boolean;
  cache: boolean;
  /** 사이트별 권한·확대/축소 */
  siteSettings: boolean;
}

/** 다운로드 내역 페이지의 버튼 */
export type DownloadAction = "open" | "show" | "remove" | "retry" | "cancel" | "pause" | "resume";

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
  /** 고정 탭 (왼쪽에 아이콘만) */
  pinned: boolean;
  /** 소리가 나는 중 / 음소거 (탭에 스피커 아이콘) */
  audible: boolean;
  muted: boolean;
}

/** 탭 하나의 상태 (툴바에는 지금 탭의 것이 보인다) */
export interface TabState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** 원본 화면으로 보는 중 (툴바의 원본/통합 토글, 앱 전체에 적용) */
  original: boolean;
  /** 이 사이트에 레시피가 있는지 (원본/통합 토글 표시용) */
  hasRecipe: boolean;
  /** 엔진 판정. 레시피가 없는 페이지면 null */
  verdict: "ok" | "degraded" | "broken" | "none" | null;
  failed: string[];
  /** 확대/축소 배율 (1 = 100%). 100% 가 아니면 주소창에 표시 */
  zoom: number;
}

/** 페이지 위 작은 창(찾기 막대·권한 묻기)과 main 이 주고받는 메시지 */
export type OverlayIn =
  | { type: "findOpen"; text: string }
  | { type: "findResult"; active: number; total: number }
  | { type: "prompt"; site: string; label: string; more: number };
export type OverlayOut =
  | { type: "find"; text: string; forward: boolean; next: boolean }
  | { type: "findClose" }
  | { type: "answer"; allow: boolean | null };

/** 툴바 화면에 보내는 상태: 지금 탭의 상태 + 탭 줄 + 북마크 */
export interface BrowserState extends TabState {
  tabs: TabInfo[];
  /** 지금 페이지가 북마크되어 있는지 (☆/★) */
  bookmarked: boolean;
  bookmarks: BookmarkData;
  /** 북마크 바 표시 (Ctrl+Shift+B, 기본 표시) */
  bookmarkBar: boolean;
  /** 오른쪽 dock 표시 (기본 표시) */
  dockOpen: boolean;
  /** 전체 화면 (macOS 는 창 버튼이 숨어서 탭 줄 왼쪽을 비우지 않음) */
  fullscreen: boolean;
  /** 툴바 다운로드 버튼: 진행 중인 다운로드 수와 전체 진행률(0~1, 크기를 모르면 null). 다운로드가 한 번도 없으면 null */
  downloads: { count: number; active: number; ratio: number | null } | null;
}
