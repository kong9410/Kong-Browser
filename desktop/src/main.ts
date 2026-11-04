// Electron main 프로세스: 창, 툴바, 탭(탭마다 WebContentsView 하나), 레시피 제공, 판정 수신
// 설계: docs/DESIGN.md 8-1절
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, screen, session as electronSession, shell, WebContentsView, type DownloadItem, type Input, type WebContents } from "electron";
import { dedupeKey, DEDUPE_MS, shouldReport, toReport } from "../../transformer/src/report";
import type { Status } from "../../transformer/src/recipe";
import * as bm from "./bookmarks.js";
import { contextItems, type ContextAction } from "./context-menu.js";
import { isFresh } from "./leave-dialog.js";
import { DOWNLOADS_MAX, isActive, overall, restoreDownloads, searchDownloads, statusText, uniqueName, type DownloadInfo } from "./downloads.js";
import { IPC, type BrowserState, type InternalRequest, type PageConfig, type Rect, type TabInfo, type TabState } from "./shared.js";
import { isPopup, popupSize } from "./popup.js";
import { parseSettings, type Settings } from "./settings.js";
import * as store from "./store.js";
import { SEARCH_URL, suggest, toUrl, type Suggestion } from "./suggest.js";
import { dragOutcome, windowAt, type Bounds, type WindowSession } from "./windows.js";

// 테스트에서 매번 깨끗한 사용자 데이터로 시작할 수 있게 (탭 복원·북마크·기록이 이전 실행에 영향받지 않도록)
if (process.env.KONG_USER_DATA) app.setPath("userData", process.env.KONG_USER_DATA);

// 앱 안쪽 페이지 주소. pathToFileURL 은 Chromium 이 보고하는 것과 같은 file:///C:/... 형태를 만든다
const fileUrl = (...p: string[]) => pathToFileURL(path.join(__dirname, ...p)).href;
const START_URL = fileUrl("ui", "start.html");
const HISTORY_URL = fileUrl("ui", "history.html");
const BOOKMARKS_URL = fileUrl("ui", "bookmarks.html");
const DOWNLOADS_URL = fileUrl("ui", "downloads.html");
/** 앱 안쪽 페이지(시작 페이지, 방문 기록, 북마크 관리)의 주소 앞부분: 이 페이지들만 기록·북마크 API 를 쓸 수 있다 */
const INTERNAL_PREFIX = decodeURIComponent(fileUrl("ui") + "/").toLowerCase();
const isInternal = (url: string) => decodeURIComponent(url).toLowerCase().startsWith(INTERNAL_PREFIX);
const samePage = (url: string, page: string) => decodeURIComponent(url).toLowerCase().startsWith(decodeURIComponent(page).toLowerCase());

// 패키징된 앱은 resources/recipes, 개발 중에는 dist/recipes (빌드 시 ../recipes 에서 복사)
// (KONG_RECIPES_DIR: 테스트에서 일부러 깨진 레시피를 넣어볼 때)
const RECIPES_DIR =
  process.env.KONG_RECIPES_DIR ??
  (app.isPackaged ? path.join(process.resourcesPath, "recipes") : path.join(__dirname, "recipes"));

interface Recipe {
  host: string;
}

function loadRecipes(): Recipe[] {
  if (!fs.existsSync(RECIPES_DIR)) return [];
  return fs
    .readdirSync(RECIPES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, f), "utf8")) as Recipe);
}

/** 탭 줄 높이와 색 (toolbar.css 의 .tabstrip 과 같아야 창 버튼이 자연스럽게 이어진다) */
const TABSTRIP_H = 40;
const TABSTRIP_BG = "#f1f3f4"; // toolbar.css --tabstrip 과 같게
const recipes = loadRecipes();

// 사용자 설정 (통일 화면의 왼쪽 메뉴 펼침 상태 등): %APPDATA%/Kong Browser/settings.json
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");
// 파일은 처음 한 번만 읽고 이후는 메모리 값 (바꾼 직후 새로고침한 페이지가 곧바로 새 값을 받도록)
let settings: Settings | null = null;
function loadSettings(): Settings {
  if (settings) return settings;
  try {
    settings = parseSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")));
  } catch {
    settings = parseSettings(null); // 기본: 왼쪽 메뉴 펼침, 북마크 바·dock 표시, 통합 화면
  }
  return settings;
}
function saveSettings(s: Settings) {
  settings = s;
  fs.writeFile(SETTINGS_FILE(), JSON.stringify(s, null, 2), () => {});
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

// ---------- 창과 탭 ----------
// 창마다 탭 줄·툴바 화면이 하나씩 있고, 탭(WebContentsView)은 창 사이를 옮겨 다닐 수 있다 (끌어서 떼기·합치기).
// 다운로드·북마크·설정은 앱 전체에서 하나

interface Win {
  win: BrowserWindow;
  tabs: Tab[];
  active: Tab | null;
  /** 페이지 영역: 위로는 탭 줄 + 툴바 높이, 오른쪽으로는 dock 폭만큼 비운다. 툴바 화면이 알려준다 */
  pageTop: number;
  pageRight: number;
  /** 주소창 자동완성 목록 (페이지 위에 겹쳐 뜨는 작은 view) */
  suggestView: WebContentsView | null;
  suggestions: Suggestion[];
}

interface Tab {
  id: number;
  /** 지금 들어 있는 창 (끌어서 옮기면 바뀐다) */
  w: Win;
  view: WebContentsView;
  state: TabState;
  favicon: string | null;
  /** 지금 페이지를 원본으로 불러왔는지 (불러올 때의 토글 값). 아직 안 불러왔으면 null */
  loadedOriginal: boolean | null;
  /** 앱이 마지막으로 시킨 이동 (주소창·뒤로·새로고침 등): 사이트가 막았다가 '나가기' 를 고르면 다시 한다 */
  intent?: { at: number; run: () => void };
}

let wins: Win[] = [];
/** 마지막으로 포커스를 가진 창 (단축키·메뉴가 없는 동작의 기준) */
let lastFocused: Win | null = null;
let nextId = 1;
/** 앱이 끝나는 중: 이때 닫히는 창은 세션에서 빼지 않는다 (다시 실행하면 모두 복원) */
let quitting = false;

const allTabs = () => wins.flatMap((w) => w.tabs);
const tabOf = (wc: WebContents) => allTabs().find((t) => t.view.webContents === wc) ?? null;
const findTab = (id: number) => allTabs().find((t) => t.id === id) ?? null;
/** 툴바 화면(보낸 쪽)의 창 */
const winOf = (wc: WebContents) => wins.find((w) => w.win.webContents === wc) ?? null;
const focusedWin = () => lastFocused ?? wins[0] ?? null;

function newTabState(): TabState {
  return {
    url: "",
    title: "새 탭",
    canGoBack: false,
    canGoForward: false,
    loading: false,
    original: false,
    hasRecipe: false,
    verdict: null,
    failed: [],
  };
}

/** 탭 상태를 바꾸고 툴바에 알린다 */
function update(tab: Tab, patch: Partial<TabState> = {}) {
  Object.assign(tab.state, patch);
  if (!tab.view.webContents.isDestroyed()) {
    const nav = tab.view.webContents.navigationHistory;
    tab.state.canGoBack = nav.canGoBack();
    tab.state.canGoForward = nav.canGoForward();
  }
  tab.state.original = loadSettings().original;
  tab.state.hasRecipe = recipes.some((r) => r.host === hostOf(tab.state.url));
  pushUI(tab.w);
}

/** 모든 창의 툴바를 새로 (북마크·다운로드·설정처럼 앱 전체 값이 바뀌었을 때) */
const pushAll = () => wins.forEach((w) => pushUI(w));

function pushUI(w: Win) {
  const { win, tabs, active } = w;
  if (!active || win.isDestroyed()) return;
  const info: TabInfo[] = tabs.map((t) => ({
    id: t.id,
    title: t.state.title,
    url: t.state.url,
    favicon: t.favicon,
    loading: t.state.loading,
    active: t === active,
  }));
  const settings = loadSettings();
  const state: BrowserState = {
    ...active.state,
    tabs: info,
    bookmarked: store.isBookmarked(active.state.url),
    bookmarks: store.bookmarkData(),
    bookmarkBar: settings.bookmarkBar,
    dockOpen: settings.dockOpen,
    fullscreen: win.isFullScreen(),
    downloads: downloads.length ? { count: downloads.length, active: 0, ratio: null, ...overall(downloads) } : null,
  };
  win.webContents.send(IPC.state, state);
  saveSession();
  win.setTitle(active.state.title ? `${active.state.title} - Kong Browser` : "Kong Browser");
}

/** 다시 실행하면 지금 창·탭들을 그대로 복원 (0.5초씩 모아서 저장) */
function saveSession() {
  if (quitting) return;
  store.saveSession({ windows: wins.filter((w) => w.tabs.length).map(windowSession) });
}
const windowSession = (w: Win): WindowSession => ({
  tabs: w.tabs.map((t) => t.state.url || START_URL),
  active: Math.max(0, w.active ? w.tabs.indexOf(w.active) : 0),
  bounds: w.win.isDestroyed() ? undefined : w.win.getNormalBounds(),
});

function layout(w: Win) {
  if (!w.active) return;
  const [width, height] = w.win.getContentSize();
  w.active.view.setBounds({ x: 0, y: w.pageTop, width: Math.max(0, width - w.pageRight), height: Math.max(0, height - w.pageTop) });
}

/** 새 탭. after 를 주면 그 탭 바로 오른쪽에 (링크로 연 탭), 아니면 맨 끝에 */
function createTab(w: Win, url: string, opts: { activate?: boolean; after?: Tab | null } = {}): Tab {
  const view = new WebContentsView({
    webPreferences: {
      // 엔진은 preload 에서 격리된 world 로 실행. 페이지는 Node/PC 파일에 접근 불가
      preload: path.join(__dirname, "preload-page.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const tab: Tab = { id: nextId++, w, view, state: newTabState(), favicon: null, loadedOriginal: null };
  const at = opts.after && w.tabs.includes(opts.after) ? w.tabs.indexOf(opts.after) + 1 : w.tabs.length;
  w.tabs.splice(at, 0, tab);

  const wc = view.webContents;
  // 새 창: 사이트가 크기를 정해 연 팝업(window.open(url, name, "width=…"))은 진짜 팝업 창으로(여는 창과 연결 유지,
  // 디시 에디터의 이미지 업로드 창 등). 그 밖의 새 창 링크(target=_blank)는 새 탭으로, Ctrl+클릭(background-tab)은 뒤에서 연다
  wc.setWindowOpenHandler(({ url: target, disposition, features }) => {
    if (isPopup(disposition, features)) {
      const size = popupSize(features);
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          ...(size && { width: size.width + 16, height: size.height + 40 }),
          parent: tab.w.win,
          autoHideMenuBar: true,
          minimizable: false,
          fullscreenable: false,
        },
      };
    }
    createTab(tab.w, target, { activate: disposition !== "background-tab", after: tab });
    return { action: "deny" };
  });
  wc.on("did-create-window", (child) => {
    child.removeMenu();
    child.webContents.on("will-prevent-unload", () => askLeave(child.webContents));
  });
  // 글쓰기 화면처럼 '나가시겠어요?'(beforeunload) 를 거는 페이지: Electron 은 확인 창 없이 이동을 그냥 막으므로
  // 일단 막힌 채로 두고 페이지 안에 확인 창을 띄운다. 나가기를 고르면 leaveGo 로 막혔던 이동을 다시
  trackIntents(tab);
  wc.on("will-prevent-unload", () => askLeave(wc, tab));
  wc.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) update(tab, { verdict: null, failed: [] });
  });
  wc.on("did-navigate", (_e, u) => {
    tab.favicon = null;
    if (/^https?:/.test(u)) store.addVisit(u, u); // 제목은 page-title-updated 에서 채움
    update(tab, { url: u });
  });
  wc.on("did-navigate-in-page", (_e, u, isMainFrame) => isMainFrame && update(tab, { url: u }));
  wc.on("page-title-updated", (_e, title) => {
    if (/^https?:/.test(tab.state.url)) store.setVisitTitle(tab.state.url, title);
    update(tab, { title });
  });
  wc.on("page-favicon-updated", (_e, icons) => {
    tab.favicon = icons[0] ?? null;
    pushUI(tab.w);
  });
  wc.on("did-start-loading", () => update(tab, { loading: true }));
  wc.on("did-stop-loading", () => update(tab, { loading: false }));
  wc.on("before-input-event", (e, input) => handleShortcut(tab.w, input) && e.preventDefault());
  wc.on("context-menu", (_e, params) => showContextMenu(tab.w, tab, params));

  wc.loadURL(url);
  if (opts.activate !== false || !w.active) activate(tab);
  else pushUI(w);
  return tab;
}

function activate(tab: Tab) {
  const w = tab.w;
  if (w.active === tab) return;
  hideSuggestions(w);
  if (w.active) w.win.contentView.removeChildView(w.active.view);
  w.active = tab;
  w.win.contentView.addChildView(tab.view);
  layout(w);
  tab.view.webContents.focus();
  syncOriginal(tab); // 다른 탭에서 원본/통합을 바꿨으면 이 탭도 맞춘다
  pushUI(w);
}

/** 창에서 탭을 뺀다 (닫거나 다른 창으로 옮길 때). 남은 탭이 없으면 false */
function detachFrom(tab: Tab): boolean {
  const w = tab.w;
  const i = w.tabs.indexOf(tab);
  if (i < 0) return w.tabs.length > 0;
  w.tabs.splice(i, 1);
  if (w.active === tab) {
    if (!w.win.isDestroyed()) w.win.contentView.removeChildView(tab.view);
    w.active = null;
    if (w.tabs.length) activate(w.tabs[Math.min(i, w.tabs.length - 1)]);
  }
  return w.tabs.length > 0;
}

/** 앱이 시키는 이동(주소 열기·뒤로·앞으로·새로고침)을 기억: 사이트가 막으면 '나가기' 뒤에 그대로 다시 한다 */
function trackIntents(tab: Tab) {
  const wc = tab.view.webContents;
  const wrap = (obj: object, name: string) => {
    const o = obj as Record<string, (...a: unknown[]) => unknown>;
    const orig = o[name].bind(obj);
    o[name] = (...args: unknown[]) => {
      tab.intent = { at: Date.now(), run: () => void Promise.resolve(orig(...args)).catch(() => {}) };
      return orig(...args);
    };
  };
  for (const name of ["loadURL", "reload"]) wrap(wc, name);
  for (const name of ["goBack", "goForward", "goToIndex", "goToOffset"]) wrap(wc.navigationHistory, name);
}

/** 나가기 확인을 기다리는 페이지: 나가기를 고르면 다시 할 이동 (모르면 null — 페이지가 방금 누른 링크로 간다) */
const pendingLeave = new WeakMap<WebContents, (() => void) | null>();

function askLeave(wc: WebContents, tab?: Tab) {
  const intent = tab?.intent;
  pendingLeave.set(wc, intent && isFresh(intent.at, Date.now()) ? intent.run : null);
  wc.send(IPC.leaveAsk);
}

ipcMain.handle(IPC.leaveGo, (e) => {
  const run = pendingLeave.get(e.sender);
  pendingLeave.delete(e.sender);
  if (!run) return false;
  run();
  return true;
});

function closeTab(tab: Tab) {
  const w = tab.w;
  const left = detachFrom(tab);
  tab.view.webContents.close();
  if (left) return pushUI(w);
  // 창의 마지막 탭을 닫으면 창을 닫는다 (Chrome 과 같은 동작).
  // 마지막 창까지 직접 다 닫은 것이면 다음 실행은 새로 시작
  if (wins.length === 1) {
    store.saveSession({ windows: [] });
    store.flush();
  }
  w.win.close();
}

/** 새 탭을 열고 주소창에 커서 (Ctrl+T, [+]) */
function openBlankTab(w: Win) {
  createTab(w, START_URL);
  w.win.webContents.focus();
  w.win.webContents.send(IPC.focusAddress);
}

/**
 * 탭 옮기기: 같은 창이면 순서만, 다른 창이면 그 창의 to 자리로 (끌어서 합치기).
 * 탭이 빠져 빈 창은 닫는다 (창이 합쳐짐)
 */
function moveTab(tab: Tab, dest: Win, to: number) {
  const src = tab.w;
  if (src === dest) {
    const from = src.tabs.indexOf(tab);
    if (from < 0) return;
    src.tabs.splice(from, 1);
    src.tabs.splice(Math.max(0, Math.min(to, src.tabs.length)), 0, tab);
    return pushUI(src);
  }
  const left = detachFrom(tab);
  tab.w = dest;
  dest.tabs.splice(Math.max(0, Math.min(to, dest.tabs.length)), 0, tab);
  activate(tab);
  dest.win.focus();
  if (left) pushUI(src);
  else src.win.close();
}

/** 탭을 새 창으로 떼어 낸다 (탭 줄 밖에 놓았을 때) */
function detachToNewWindow(tab: Tab, bounds: Bounds) {
  const dest = createWindow({ bounds });
  moveTab(tab, dest, 0);
}

/** 탭 끌기가 끝났을 때 (끈 쪽 창의 툴바가 알려줌). 다른 탭 줄에 놓였으면 그쪽이 이미 옮겼다 */
const lastDrop = new Map<number, number>();
function tabDragEnd(tab: Tab) {
  // 놓인 창의 drop 알림이 늦게 올 수 있어 잠깐 기다린다
  setTimeout(() => {
    const w = tab.w;
    if (w.win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    // 다른 창들: 최근에 포커스를 가진 창부터 (겹쳐 있으면 위에 있는 창)
    const others = BrowserWindow.getAllWindows()
      .map((bw) => wins.find((x) => x.win === bw && x !== w))
      .filter((x): x is Win => !!x && !x.win.isMinimized());
    const outcome = dragOutcome({
      droppedOnStrip: Date.now() - (lastDrop.get(tab.id) ?? 0) < 1500,
      cursor,
      source: w.win.getBounds(),
      others: others.map((x) => x.win.getBounds()),
      stripBottom: TABSTRIP_H,
      sourceTabs: w.tabs.length,
    });
    const work = screen.getDisplayNearestPoint(cursor).workArea;
    const [width, height] = w.win.getSize();
    if (outcome.kind === "merge") moveTab(tab, others[outcome.target], others[outcome.target].tabs.length);
    else if (outcome.kind === "newWindow") detachToNewWindow(tab, windowAt(cursor, { width, height }, work));
    else if (outcome.kind === "moveWindow" && !w.win.isMaximized()) w.win.setBounds(windowAt(cursor, { width, height }, work));
  }, 120);
}

/** 북마크 ☆/★ (지금 탭의 페이지) */
function toggleBookmark(w: Win) {
  const active = w.active;
  if (!active || !/^https?:/.test(active.state.url)) return;
  const { url, title } = active.state;
  store.editBookmarks((d) => (bm.find(d, url) ? bm.remove(d, url) : bm.add(d, { url, title: title || url, favicon: active.favicon })));
  pushAll();
}

const editBookmarks = (fn: Parameters<typeof store.editBookmarks>[0]) => {
  store.editBookmarks(fn);
  pushAll();
};

/** "폴더로 이동" 하위 메뉴: 북마크 바 + 폴더들, 지금 있는 곳에 체크 */
function moveMenu(url: string): Electron.MenuItemConstructorOptions {
  const d = store.bookmarkData();
  const now = bm.find(d, url)?.folder ?? null;
  const to = (folder: string | null, label: string): Electron.MenuItemConstructorOptions => ({
    label,
    type: "radio",
    checked: now === folder,
    click: () => editBookmarks((x) => bm.move(x, url, folder)),
  });
  return {
    label: "폴더로 이동",
    submenu: [to(null, "북마크 바"), ...d.folders.map((fo) => to(fo.id, fo.name)), { type: "separator" }, { label: "새 폴더 만들기…", click: () => openBookmarks() }],
  };
}

/** 같은 앱 안쪽 페이지가 이 창에 열려 있으면 그 탭으로(새로 읽음), 없으면 새 탭 */
function openInternal(w: Win | null, page: string) {
  if (!w) return;
  const open = w.tabs.find((t) => samePage(t.state.url, page));
  if (open) {
    activate(open);
    open.view.webContents.reload();
  } else createTab(w, page, { after: w.active });
}
const openBookmarks = (w = focusedWin()) => openInternal(w, BOOKMARKS_URL);
const openDownloads = (w = focusedWin()) => openInternal(w, DOWNLOADS_URL);

// ---------- 주소창 자동완성 목록 (페이지 위에 겹쳐 뜨는 작은 창) ----------
// 페이지(WebContentsView)는 툴바 화면보다 위에 그려지므로, 목록은 별도의 view 로 페이지 위에 띄운다.

const ROW_H = 36;

function ensureSuggestView(w: Win): WebContentsView {
  if (w.suggestView) return w.suggestView;
  const v = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "preload-suggest.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  v.setBackgroundColor("#00000000");
  v.webContents.loadFile(path.join(__dirname, "ui", "suggest.html"));
  w.suggestView = v;
  return v;
}

function showSuggestions(w: Win, list: Suggestion[], at: Rect) {
  w.suggestions = list;
  const v = ensureSuggestView(w);
  if (!list.length) return hideSuggestions(w);
  v.setBounds({ x: Math.round(at.x), y: Math.round(at.y + at.height + 4), width: Math.round(at.width), height: list.length * ROW_H + 12 });
  w.win.contentView.addChildView(v); // 이미 있으면 맨 위로
  v.webContents.send(IPC.suggestList, list, 0);
}

function hideSuggestions(w: Win) {
  w.suggestions = [];
  if (w.suggestView && !w.win.isDestroyed() && w.win.contentView.children.includes(w.suggestView)) w.win.contentView.removeChildView(w.suggestView);
}
/** 자동완성 목록 view 가 보낸 IPC 의 창 */
const winOfSuggest = (wc: WebContents) => wins.find((w) => w.suggestView?.webContents === wc) ?? null;

/** 방문 기록 페이지 */
const openHistory = (w = focusedWin()) => openInternal(w, HISTORY_URL);

/** 북마크 바·dock 보이기/숨기기 */
function toggleSetting(key: "bookmarkBar" | "dockOpen") {
  const s = loadSettings();
  saveSettings({ ...s, [key]: !s[key] });
  pushAll();
}

/** 지금 토글 값과 다르게 불러온 페이지면 다시 불러온다 (원본 ↔ 통합) */
function syncOriginal(tab: Tab) {
  if (tab.loadedOriginal !== null && tab.state.hasRecipe && tab.loadedOriginal !== loadSettings().original)
    tab.view.webContents.reload();
}

/** 페이지 오른쪽 클릭 메뉴: 링크·이미지(저장·복사)·선택한 글(복사·검색)·입력칸 (Electron 은 기본 메뉴가 없다) */
function showContextMenu(w: Win, tab: Tab | null, p: Electron.ContextMenuParams) {
  // tab 이 null 이면 툴바(주소창)
  const wc = tab ? tab.view.webContents : w.win.webContents;
  const active = w.active;
  const nav = wc.navigationHistory;
  const run: Record<ContextAction, () => void> = {
    openLinkTab: () => createTab(w, p.linkURL, { activate: false, after: tab ?? active }),
    copyLink: () => clipboard.writeText(p.linkURL),
    openImageTab: () => createTab(w, p.srcURL, { after: tab ?? active }),
    saveImage: () => wc.downloadURL(p.srcURL), // 다운로드 폴더에 저장 (다운로드 내역에도 남음)
    copyImage: () => wc.copyImageAt(p.x, p.y),
    copyImageUrl: () => clipboard.writeText(p.srcURL),
    cut: () => wc.cut(),
    copy: () => wc.copy(),
    paste: () => wc.paste(),
    // 클립보드의 주소(또는 검색어)로 바로 이동
    pasteAndGo: () => {
      const text = clipboard.readText().trim();
      if (text) current(w)?.loadURL(toUrl(text));
    },
    selectAll: () => wc.selectAll(),
    search: () => createTab(w, SEARCH_URL + encodeURIComponent(p.selectionText.trim()), { after: tab ?? active }),
    back: () => nav.goBack(),
    forward: () => nav.goForward(),
    reload: () => wc.reload(),
    inspect: () => wc.inspectElement(p.x, p.y),
  };
  const items = contextItems({ ...p, canGoBack: nav.canGoBack(), canGoForward: nav.canGoForward(), toolbar: !tab });
  if (!items.length) return;
  Menu.buildFromTemplate(
    items.map((i): Electron.MenuItemConstructorOptions =>
      "separator" in i ? { type: "separator" } : { label: i.label, enabled: i.enabled ?? true, click: run[i.id] },
    ),
  ).popup({ window: w.win });
}

/** 단축키: 툴바와 페이지 어느 쪽에 포커스가 있어도 동작 (그 창 기준) */
function handleShortcut(w: Win, input: Input): boolean {
  const { win, tabs, active } = w;
  if (input.type !== "keyDown" || !active) return false;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();
  const wc = active.view.webContents;
  const nav = wc.navigationHistory;
  const step = (d: number) => activate(tabs[(tabs.indexOf(active!) + d + tabs.length) % tabs.length]);
  if ((ctrl && key === "l") || input.key === "F6") win.webContents.send(IPC.focusAddress);
  else if (ctrl && input.shift && key === "b") toggleSetting("bookmarkBar");
  else if (ctrl && key === "d") toggleBookmark(w);
  else if (ctrl && key === "h") openHistory(w);
  else if (ctrl && key === "j") openDownloads(w);
  else if (ctrl && input.shift && key === "o") openBookmarks(w);
  else if (ctrl && key === "n") createWindow({ urls: [START_URL] });
  else if (ctrl && key === "t") openBlankTab(w);
  else if (ctrl && (key === "w" || input.key === "F4")) closeTab(active);
  else if (ctrl && (input.key === "Tab" || input.key === "PageDown" || input.key === "PageUp"))
    step(input.shift || input.key === "PageUp" ? -1 : 1);
  else if (ctrl && /^[1-9]$/.test(input.key)) {
    // Ctrl+1~8 = 그 번째 탭, Ctrl+9 = 마지막 탭
    const n = Number(input.key);
    const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
    if (target) activate(target);
  } else if (input.alt && input.key === "ArrowLeft") nav.canGoBack() && nav.goBack();
  else if (input.alt && input.key === "ArrowRight") nav.canGoForward() && nav.goForward();
  else if (input.key === "F5" || (ctrl && key === "r")) wc.reload();
  else if (input.key === "F12") wc.toggleDevTools();
  else return false;
  return true;
}

/** 창 하나를 만든다. urls 를 주면 그 탭들로, 안 주면 빈 창(끌어 온 탭을 받을 창) */
function createWindow(opts: { urls?: string[]; active?: number; bounds?: Bounds } = {}): Win {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    ...opts.bounds,
    minWidth: 480,
    minHeight: 400,
    title: "Kong Browser",
    autoHideMenuBar: true,
    // Chrome 처럼 제목 표시줄을 없애고 탭 줄을 맨 위로. 최소화/최대화/닫기는 Windows 가 탭 줄 오른쪽 끝에 그린다
    titleBarStyle: "hidden",
    titleBarOverlay: { color: TABSTRIP_BG, symbolColor: "#3a3a3c", height: TABSTRIP_H },
    // macOS 는 창 버튼(신호등)이 탭 줄 왼쪽에: 40px 탭 줄 가운데 높이로 (툴바가 그 자리를 비운다)
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, "preload-ui.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  const w: Win = { win, tabs: [], active: null, pageTop: 84, pageRight: 0, suggestView: null, suggestions: [] };
  wins.push(w);
  lastFocused = w;
  win.on("focus", () => (lastFocused = w));
  win.on("resize", () => layout(w));
  win.on("moved", saveSession);
  // 전체 화면에서는 macOS 창 버튼이 숨으므로 탭 줄이 그 자리를 비우지 않는다
  win.on("enter-full-screen", () => pushUI(w));
  win.on("leave-full-screen", () => pushUI(w));
  win.on("close", () => {
    // 앱 전체를 끄는 게 아니라 이 창만 닫는 것이면 세션에서 이 창을 뺀다 (마지막 창은 다시 실행할 때 복원)
    if (wins.length > 1) {
      wins = wins.filter((x) => x !== w);
      saveSession();
    } else quitting = true;
  });
  win.on("closed", () => {
    wins = wins.filter((x) => x !== w);
    if (lastFocused === w) lastFocused = wins[0] ?? null;
    for (const t of w.tabs) if (!t.view.webContents.isDestroyed()) t.view.webContents.close();
  });
  win.webContents.on("before-input-event", (e, input) => handleShortcut(w, input) && e.preventDefault());
  // 주소창 오른쪽 클릭: 잘라내기·복사·붙여넣기·붙여넣고 이동·모두 선택
  win.webContents.on("context-menu", (_e, params) => showContextMenu(w, null, params));
  win.loadFile(path.join(__dirname, "ui", "index.html"));

  const urls = opts.urls ?? [];
  urls.forEach((u) => createTab(w, u, { activate: false }));
  if (w.tabs.length) activate(w.tabs[Math.min(Math.max(opts.active ?? 0, 0), w.tabs.length - 1)]);
  return w;
}

function start() {
  // Windows 가 다크 모드여도 앱은 밝은 모드가 기본 (제목 표시줄, 통일 화면, 사이트의 prefers-color-scheme 모두)
  // 다크 모드는 후순위: 나중에 설정 화면에서 "system" | "dark" 를 고를 수 있게 한다
  nativeTheme.themeSource = "light";

  // 시작: 주소를 주고 실행하면 그 주소만, 아니면 지난번 창·탭들을 복원 (없으면 시작 페이지)
  const argUrl = process.argv.find((a) => /^https?:\/\//.test(a));
  const session = store.loadSession();
  if (argUrl) createWindow({ urls: [argUrl] });
  else if (session.windows.length) for (const s of session.windows) createWindow({ urls: s.tabs, active: s.active, bounds: s.bounds });
  else createWindow({ urls: [START_URL] });
  wins[0]?.win.focus();

  // 테스트 자동화(Playwright)에서 상태를 읽을 수 있게: win/page/state/tabs 는 포커스를 가진(마지막) 창의 것
  if (process.env.KONG_TEST)
    (globalThis as any).__kong = {
      get win() {
        return focusedWin()?.win;
      },
      get page() {
        return focusedWin()?.active?.view;
      },
      get state() {
        return focusedWin()?.active?.state;
      },
      get tabs() {
        const w = focusedWin();
        return (w?.tabs ?? []).map((t) => ({ id: t.id, url: t.state.url, title: t.state.title, active: t === w?.active }));
      },
      get windows() {
        return wins.map((w) => w.tabs.map((t) => t.state.url));
      },
      get suggest() {
        const w = focusedWin();
        return { visible: !!w?.suggestView && w.win.contentView.children.includes(w.suggestView), list: w?.suggestions ?? [] };
      },
    };
}

// ---------- 페이지 preload (어느 탭에서 왔는지는 보낸 쪽 webContents 로 안다) ----------

ipcMain.on(IPC.pageConfig, (e, url: string) => {
  const tab = tabOf(e.sender);
  const off = !!tab && loadSettings().original;
  if (tab) tab.loadedOriginal = off;
  const config: PageConfig = {
    recipes: tab ? recipes : [],
    off,
    navOpen: loadSettings().navOpen,
    visited: tab && !off ? store.visitedOn(hostOf(url)) : [],
  };
  e.returnValue = config;
});

ipcMain.on(IPC.pageNav, (e, open: boolean) => {
  if (tabOf(e.sender)) saveSettings({ ...loadSettings(), navOpen: !!open });
});

ipcMain.on(IPC.pageStatus, (e, json: string) => {
  const tab = tabOf(e.sender);
  if (!tab) return;
  const s = JSON.parse(json) as Status;
  update(tab, { verdict: s.verdict, failed: s.failed ?? [] });
  saveReport(s, tab.view.webContents.getURL());
});

// ---------- 고장 보고 (설계 7-2절) ----------
// 서버(M4)가 생기기 전까지는 로컬 파일에 쌓는다: %APPDATA%/Kong Browser/reports.jsonl
const lastReported = new Map<string, number>();
function saveReport(s: Status, url: string) {
  if (!shouldReport(s)) return;
  const r = toReport(s, url, app.getVersion());
  const key = dedupeKey(r);
  if (Date.now() - (lastReported.get(key) ?? 0) < DEDUPE_MS) return;
  lastReported.set(key, Date.now());
  fs.appendFile(path.join(app.getPath("userData"), "reports.jsonl"), JSON.stringify(r) + "\n", () => {});
}

// ---------- 툴바 (지금 탭에 대해) ----------

const current = (w: Win | null) => w?.active?.view.webContents;
/** 툴바 IPC 처리기: 보낸 툴바의 창을 찾아서 넘긴다 */
const onUI = <A extends unknown[]>(channel: string, fn: (w: Win, ...args: A) => void) =>
  ipcMain.on(channel, (e, ...args) => {
    const w = winOf(e.sender);
    if (w) fn(w, ...(args as A));
  });
onUI(IPC.ready, (w) => pushUI(w));
onUI(IPC.navigate, (w, text: string) => current(w)?.loadURL(toUrl(text)));
onUI(IPC.back, (w) => current(w)?.navigationHistory.goBack());
onUI(IPC.forward, (w) => current(w)?.navigationHistory.goForward());
onUI(IPC.reload, (w) => current(w)?.reload());
onUI(IPC.stop, (w) => current(w)?.stop());
onUI(IPC.toggleOriginal, (w) => {
  if (!w.active) return;
  // 원본 ↔ 통합: 앱 전체 토글. 지금 탭은 바로 새로고침하고, 다른 탭은 열 때 맞춘다 (syncOriginal)
  const s = loadSettings();
  saveSettings({ ...s, original: !s.original });
  for (const t of allTabs()) t.state.original = !s.original;
  syncOriginal(w.active);
  pushAll();
});
onUI(IPC.newTab, (w) => openBlankTab(w));
onUI(IPC.closeTab, (_w, id: number) => {
  const tab = findTab(id);
  if (tab) closeTab(tab);
});
onUI(IPC.selectTab, (_w, id: number) => {
  const tab = findTab(id);
  if (tab) activate(tab);
});
// 탭 줄에 놓음: 같은 창이면 순서 바꾸기, 다른 창의 탭이면 이 창으로 옮김 (창 합치기)
onUI(IPC.moveTab, (w, id: number, to: number) => {
  const tab = findTab(id);
  if (!tab) return;
  lastDrop.set(id, Date.now());
  moveTab(tab, w, to);
});
// 탭 끌기가 끝남: 탭 줄 밖에 놓았으면 새 창으로 떼어 냄
onUI(IPC.tabDragEnd, (_w, id: number) => {
  const tab = findTab(id);
  if (tab) tabDragEnd(tab);
});
onUI(IPC.openUrl, (w, url: string, where: "current" | "tab" | "background") => {
  if (where === "current") current(w)?.loadURL(url);
  else createTab(w, url, { activate: where === "tab", after: w.active });
});
onUI(IPC.toggleBookmark, (w) => toggleBookmark(w));
onUI(IPC.openHistory, (w) => openHistory(w));
onUI(IPC.toggleDock, () => toggleSetting("dockOpen"));
// 북마크 바에서 오른쪽 클릭
onUI(IPC.bookmarkMenu, (w, url: string) => {
  Menu.buildFromTemplate([
    { label: "새 탭에서 열기", click: () => createTab(w, url, { after: w.active }) },
    moveMenu(url),
    { type: "separator" },
    { label: "북마크 삭제", click: () => editBookmarks((d) => bm.remove(d, url)) },
    { label: "북마크 관리", click: () => openBookmarks(w) },
  ]).popup({ window: w.win });
});
// ★ (이미 북마크된 페이지) 를 눌렀을 때
onUI(IPC.starMenu, (w, at: Rect) => {
  if (!w.active) return;
  const url = w.active.state.url;
  Menu.buildFromTemplate([
    { label: "북마크됨", enabled: false },
    moveMenu(url),
    { type: "separator" },
    { label: "북마크 삭제", click: () => editBookmarks((d) => bm.remove(d, url)) },
    { label: "북마크 관리", click: () => openBookmarks(w) },
  ]).popup({ window: w.win, x: Math.round(at.x), y: Math.round(at.y + at.height) });
});
// 북마크 바의 폴더를 눌렀을 때: 안의 북마크 (Ctrl+클릭 = 뒤쪽 새 탭)
onUI(IPC.folderMenu, (w, id: string, at: Rect) => {
  const group = bm.tree(store.bookmarkData()).folders.find((g) => g.folder.id === id);
  if (!group) return;
  const items: Electron.MenuItemConstructorOptions[] = group.bookmarks.map((b) => ({
    label: b.title.length > 60 ? b.title.slice(0, 60) + "…" : b.title,
    click: (_i, _w, e) => (e.ctrlKey || e.metaKey ? createTab(w, b.url, { activate: false, after: w.active }) : current(w)?.loadURL(b.url)),
  }));
  if (!items.length) items.push({ label: "(비어 있음)", enabled: false });
  else
    items.push(
      { type: "separator" },
      { label: "모두 새 탭에서 열기", click: () => group.bookmarks.forEach((b) => createTab(w, b.url, { activate: false, after: w.active })) },
    );
  items.push({ label: "북마크 관리", click: () => openBookmarks(w) });
  Menu.buildFromTemplate(items).popup({ window: w.win, x: Math.round(at.x), y: Math.round(at.y + at.height) });
});
onUI(IPC.openBookmarks, (w) => openBookmarks(w));

// 주소창 자동완성
ipcMain.handle(IPC.suggest, (e, text: string, at: Rect) => {
  const w = winOf(e.sender);
  if (!w) return [];
  const d = store.bookmarkData();
  const list = suggest(text, {
    bookmarks: d.bookmarks.map((b) => ({ url: b.url, title: b.title, folder: bm.folderName(d, b.folder) ?? null })),
    history: store.historyEntries(),
  });
  showSuggestions(w, list, at);
  return list;
});
onUI(IPC.suggestSelect, (w, i: number) => w.suggestView?.webContents.send(IPC.suggestList, w.suggestions, i));
onUI(IPC.suggestHide, (w) => hideSuggestions(w));
// 목록에서 고름: 툴바(Enter)나 목록 view(클릭) 어느 쪽에서든 온다
ipcMain.on(IPC.suggestChoose, (e, url: string) => {
  const w = winOf(e.sender) ?? winOfSuggest(e.sender);
  if (!w) return;
  hideSuggestions(w);
  current(w)?.loadURL(url);
  w.active?.view.webContents.focus();
});

// 앱 안쪽 페이지(시작 페이지, 방문 기록)만 쓸 수 있는 기록·북마크 API
ipcMain.handle(IPC.internal, (e, req: InternalRequest) => {
  if (!isInternal(e.sender.getURL())) throw new Error("not allowed");
  switch (req.op) {
    case "history":
      return store.searchHistory(req.query, req.limit);
    case "removeVisit":
      return store.removeVisit(req.id);
    case "clearHistory":
      return store.clearHistory();
    case "bookmarks":
      return store.bookmarkData();
    case "removeBookmark":
      return editBookmarks((d) => bm.remove(d, req.url));
    case "renameBookmark":
      return editBookmarks((d) => bm.rename(d, req.url, req.title));
    case "moveBookmark":
      return editBookmarks((d) => bm.move(d, req.url, req.folder));
    case "addFolder":
      return editBookmarks((d) => bm.addFolder(d, req.name, store.newFolderId()));
    case "renameFolder":
      return editBookmarks((d) => bm.renameFolder(d, req.id, req.name));
    case "removeFolder":
      return editBookmarks((d) => bm.removeFolder(d, req.id));
    case "downloads":
      // 다 받은 파일이 아직 있는지도 (지웠거나 옮긴 파일은 "삭제됨"으로 표시)
      return searchDownloads(downloads, req.query).map((d) => ({ ...d, exists: d.state !== "completed" || fs.existsSync(d.path) }));
    case "downloadAction":
      return downloadAction(req.id, req.action);
    case "clearDownloads":
      return clearDownloads();
    case "openDownloadsFolder":
      return void shell.openPath(app.getPath("downloads"));
  }
});

onUI(IPC.layout, (w, box: { top: number; right: number }) => {
  const top = Math.ceil(box.top);
  const right = Math.ceil(box.right);
  if (top > 0 && (top !== w.pageTop || right !== w.pageRight)) {
    w.pageTop = top;
    w.pageRight = right;
    layout(w);
  }
});

// ---------- 다운로드 ----------
// Chrome 처럼 묻지 않고 사용자 "다운로드" 폴더에 저장하고, 툴바 버튼에 진행을 보여준다.
// 내역은 downloads.json 에 남아 다시 실행해도 다운로드 내역 페이지(Ctrl+J)에서 볼 수 있다
let downloads: DownloadInfo[] = [];
const downloadItems = new Map<number, DownloadItem>();
let downloadSeq = 1;
let downloadPush: NodeJS.Timeout | null = null;
/** 진행 이벤트는 자주 오므로 0.2초에 한 번만 툴바에 알린다 */
const pushDownloadsSoon = () =>
  (downloadPush ??= setTimeout(() => {
    downloadPush = null;
    pushAll();
  }, 200));

/** 내역 저장: 시작·끝·삭제 때만 (진행 중 바이트 수는 저장하지 않아도 된다) */
function saveDownloads() {
  if (downloads.length > DOWNLOADS_MAX) {
    // 오래된 것부터, 받는 중인 것은 남긴다
    for (let i = downloads.length - 1; i >= 0 && downloads.length > DOWNLOADS_MAX; i--) if (!isActive(downloads[i])) downloads.splice(i, 1);
  }
  store.saveDownloads(downloads);
}

function downloadAction(id: number, action: import("./shared.js").DownloadAction) {
  const d = downloads.find((x) => x.id === id);
  if (!d) return;
  const item = downloadItems.get(id);
  switch (action) {
    case "open":
      return void shell.openPath(d.path);
    case "show":
      return shell.showItemInFolder(d.path);
    case "retry":
      return current(focusedWin())?.downloadURL(d.url);
    case "cancel":
      return item?.cancel();
    case "pause":
      return item?.pause();
    case "resume":
      return item?.resume();
    case "remove":
      // 받는 중이면 취소하고 목록에서 뺀다 (받은 파일은 지우지 않는다)
      item?.cancel();
      downloads = downloads.filter((x) => x.id !== id);
      saveDownloads();
      return pushAll();
  }
}

/** 목록 모두 지우기: 받는 중인 것은 남긴다 (파일은 그대로) */
function clearDownloads() {
  downloads = downloads.filter(isActive);
  saveDownloads();
  pushAll();
}

function trackDownloads() {
  downloads = restoreDownloads(store.loadDownloads());
  downloadSeq = downloads.reduce((m, d) => Math.max(m, d.id), 0) + 1;
  electronSession.defaultSession.on("will-download", (_e, item) => {
    const dir = app.getPath("downloads");
    // 아직 받는 중인 같은 이름 파일도 피한다 (디스크에는 다 받은 뒤에 생김)
    const taken = (n: string) => fs.existsSync(path.join(dir, n)) || downloads.some((d) => isActive(d) && d.name === n);
    const name = uniqueName(item.getFilename(), taken);
    const d: DownloadInfo = {
      id: downloadSeq++,
      name,
      path: path.join(dir, name),
      url: item.getURL(),
      received: 0,
      total: item.getTotalBytes(),
      state: "progressing",
      startedAt: Date.now(),
    };
    item.setSavePath(d.path);
    downloads.unshift(d);
    downloadItems.set(d.id, item);
    saveDownloads();
    item.on("updated", (_ev, st) => {
      d.received = item.getReceivedBytes();
      d.total = item.getTotalBytes();
      d.state = st === "interrupted" ? "interrupted" : item.isPaused() ? "paused" : "progressing";
      pushDownloadsSoon();
    });
    item.once("done", (_ev, st) => {
      d.received = item.getReceivedBytes();
      d.state = st;
      downloadItems.delete(d.id);
      saveDownloads();
      pushAll();
    });
    pushAll();
  });
}

/** 툴바 다운로드 버튼: 최근 다운로드 목록 (누르면 열기 / 폴더에서 보기 / 취소) */
onUI(IPC.downloadsMenu, (w, at: Rect) => {
  // 최근 15개 (전체는 다운로드 내역 페이지)
  const items: Electron.MenuItemConstructorOptions[] = downloads.slice(0, 15).map((d) => {
    const item = downloadItems.get(d.id);
    const label = `${d.name.length > 50 ? d.name.slice(0, 50) + "…" : d.name}  —  ${statusText(d)}`;
    const sub: Electron.MenuItemConstructorOptions[] =
      d.state === "completed"
        ? [
            { label: "열기", click: () => shell.openPath(d.path) },
            { label: "폴더에서 보기", click: () => shell.showItemInFolder(d.path) },
          ]
        : item
          ? [
              item.isPaused() ? { label: "계속", click: () => item.resume() } : { label: "일시 중지", click: () => item.pause() },
              { label: "취소", click: () => item.cancel() },
            ]
          : [{ label: "다시 받기", click: () => current(w)?.downloadURL(d.url) }];
    return { label, submenu: sub };
  });
  items.push(
    { type: "separator" },
    { label: "다운로드 내역 전체 보기", accelerator: "CmdOrCtrl+J", click: () => openDownloads(w) },
    { label: "다운로드 폴더 열기", click: () => shell.openPath(app.getPath("downloads")) },
    { label: "목록 지우기", enabled: downloads.some((d) => !isActive(d)), click: clearDownloads },
  );
  Menu.buildFromTemplate(items).popup({ window: w.win, x: Math.round(at.x), y: Math.round(at.y + at.height) });
});

app.whenReady().then(() => {
  trackDownloads();
  start();
});
app.on("before-quit", () => {
  // 앱을 끄면 지금 창들을 모두 남긴다 (창이 하나씩 닫히며 세션에서 빠지지 않게)
  saveSession();
  quitting = true;
  store.flush();
});
app.on("window-all-closed", () => {
  store.flush();
  app.quit();
});
