// Electron main 프로세스: 창, 툴바, 탭(탭마다 WebContentsView 하나), 레시피 제공, 판정 수신
// 설계: docs/DESIGN.md 8-1절
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, WebContentsView, type Input, type WebContents } from "electron";
import { dedupeKey, DEDUPE_MS, shouldReport, toReport } from "../../transformer/src/report";
import type { Status } from "../../transformer/src/recipe";
import * as bm from "./bookmarks.js";
import { IPC, type BrowserState, type InternalRequest, type PageConfig, type Rect, type TabInfo, type TabState } from "./shared.js";
import * as store from "./store.js";
import { suggest, toUrl, type Suggestion } from "./suggest.js";

// 테스트에서 매번 깨끗한 사용자 데이터로 시작할 수 있게 (탭 복원·북마크·기록이 이전 실행에 영향받지 않도록)
if (process.env.KONG_USER_DATA) app.setPath("userData", process.env.KONG_USER_DATA);

// 앱 안쪽 페이지 주소. pathToFileURL 은 Chromium 이 보고하는 것과 같은 file:///C:/... 형태를 만든다
const fileUrl = (...p: string[]) => pathToFileURL(path.join(__dirname, ...p)).href;
const START_URL = fileUrl("ui", "start.html");
const HISTORY_URL = fileUrl("ui", "history.html");
const BOOKMARKS_URL = fileUrl("ui", "bookmarks.html");
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

let win: BrowserWindow;
/** 페이지 영역 시작 위치 (탭 줄 + 툴바 높이). 툴바 화면이 알려준다 */
let pageTop = 84;
const recipes = loadRecipes();

// 사용자 설정 (통일 화면의 왼쪽 메뉴 펼침 상태 등): %APPDATA%/Kong Browser/settings.json
interface Settings {
  navOpen: boolean;
  bookmarkBar: boolean;
}
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings(): Settings {
  try {
    return { navOpen: true, bookmarkBar: true, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")) };
  } catch {
    return { navOpen: true, bookmarkBar: true }; // 기본: 왼쪽 메뉴 펼침, 북마크 바 표시
  }
}
function saveSettings(s: Settings) {
  fs.writeFile(SETTINGS_FILE(), JSON.stringify(s, null, 2), () => {});
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

// ---------- 탭 ----------

interface Tab {
  id: number;
  view: WebContentsView;
  state: TabState;
  favicon: string | null;
  /** "원본 보기"를 켠 페이지 URL. 다른 페이지로 이동하면 자연히 재배치가 다시 적용된다 (탭마다 따로) */
  originalUrl: string | null;
}

let tabs: Tab[] = [];
let active: Tab | null = null;
let nextId = 1;

const tabOf = (wc: WebContents) => tabs.find((t) => t.view.webContents === wc) ?? null;

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
  tab.state.original = tab.originalUrl !== null && tab.originalUrl === tab.state.url;
  tab.state.hasRecipe = recipes.some((r) => r.host === hostOf(tab.state.url));
  pushUI();
}

function pushUI() {
  if (!active || win.isDestroyed()) return;
  const info: TabInfo[] = tabs.map((t) => ({
    id: t.id,
    title: t.state.title,
    url: t.state.url,
    favicon: t.favicon,
    loading: t.state.loading,
    active: t === active,
  }));
  const state: BrowserState = {
    ...active.state,
    tabs: info,
    bookmarked: store.isBookmarked(active.state.url),
    bookmarks: store.bookmarkData(),
    bookmarkBar: loadSettings().bookmarkBar,
  };
  win.webContents.send(IPC.state, state);
  // 다시 실행하면 지금 탭들을 그대로 복원 (0.5초씩 모아서 저장)
  store.saveSession({ tabs: tabs.map((t) => t.state.url || START_URL), active: tabs.indexOf(active) });
  win.setTitle(active.state.title ? `${active.state.title} - Kong Browser` : "Kong Browser");
}

function layout() {
  if (!active) return;
  const [width, height] = win.getContentSize();
  active.view.setBounds({ x: 0, y: pageTop, width, height: Math.max(0, height - pageTop) });
}

/** 새 탭. after 를 주면 그 탭 바로 오른쪽에 (링크로 연 탭), 아니면 맨 끝에 */
function createTab(url: string, opts: { activate?: boolean; after?: Tab | null } = {}): Tab {
  const view = new WebContentsView({
    webPreferences: {
      // 엔진은 preload 에서 격리된 world 로 실행. 페이지는 Node/PC 파일에 접근 불가
      preload: path.join(__dirname, "preload-page.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const tab: Tab = { id: nextId++, view, state: newTabState(), favicon: null, originalUrl: null };
  const at = opts.after ? tabs.indexOf(opts.after) + 1 : tabs.length;
  tabs.splice(at, 0, tab);

  const wc = view.webContents;
  // 새 창으로 열리는 링크(target=_blank, window.open)는 새 탭으로. Ctrl+클릭(background-tab)은 뒤에서 연다
  wc.setWindowOpenHandler(({ url: target, disposition }) => {
    createTab(target, { activate: disposition !== "background-tab", after: tab });
    return { action: "deny" };
  });
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
    pushUI();
  });
  wc.on("did-start-loading", () => update(tab, { loading: true }));
  wc.on("did-stop-loading", () => update(tab, { loading: false }));
  wc.on("before-input-event", (e, input) => handleShortcut(input) && e.preventDefault());

  wc.loadURL(url);
  if (opts.activate !== false || !active) activate(tab);
  else pushUI();
  return tab;
}

function activate(tab: Tab) {
  if (active === tab) return;
  hideSuggestions();
  if (active) win.contentView.removeChildView(active.view);
  active = tab;
  win.contentView.addChildView(tab.view);
  layout();
  tab.view.webContents.focus();
  pushUI();
}

function closeTab(tab: Tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  if (tabs.length === 0) {
    // 마지막 탭을 닫으면 창을 닫는다 (Chrome 과 같은 동작). 직접 다 닫은 것이므로 다음 실행은 새로 시작
    store.saveSession({ tabs: [], active: 0 });
    store.flush();
    win.close();
    return;
  }
  if (active === tab) {
    win.contentView.removeChildView(tab.view);
    active = null;
    activate(tabs[Math.min(i, tabs.length - 1)]);
  }
  tab.view.webContents.close();
  pushUI();
}

/** 새 탭을 열고 주소창에 커서 (Ctrl+T, [+]) */
function openBlankTab() {
  createTab(START_URL);
  win.webContents.focus();
  win.webContents.send(IPC.focusAddress);
}

/** 탭 순서 바꾸기 (탭 줄에서 끌어 놓기) */
function moveTab(tab: Tab, to: number) {
  const from = tabs.indexOf(tab);
  if (from < 0) return;
  tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, tab);
  pushUI();
}

/** 북마크 ☆/★ (지금 탭의 페이지) */
function toggleBookmark() {
  if (!active || !/^https?:/.test(active.state.url)) return;
  const { url, title } = active.state;
  store.editBookmarks((d) => (bm.find(d, url) ? bm.remove(d, url) : bm.add(d, { url, title: title || url, favicon: active!.favicon })));
  pushUI();
}

const editBookmarks = (fn: Parameters<typeof store.editBookmarks>[0]) => {
  store.editBookmarks(fn);
  pushUI();
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
    submenu: [to(null, "북마크 바"), ...d.folders.map((fo) => to(fo.id, fo.name)), { type: "separator" }, { label: "새 폴더 만들기…", click: openBookmarks }],
  };
}

/** 같은 앱 안쪽 페이지가 열려 있으면 그 탭으로(새로 읽음), 없으면 새 탭 */
function openInternal(page: string) {
  const open = tabs.find((t) => samePage(t.state.url, page));
  if (open) {
    activate(open);
    open.view.webContents.reload();
  } else createTab(page, { after: active });
}
const openBookmarks = () => openInternal(BOOKMARKS_URL);

// ---------- 주소창 자동완성 목록 (페이지 위에 겹쳐 뜨는 작은 창) ----------
// 페이지(WebContentsView)는 툴바 화면보다 위에 그려지므로, 목록은 별도의 view 로 페이지 위에 띄운다.

let suggestView: WebContentsView | null = null;
let suggestions: Suggestion[] = [];
const ROW_H = 36;

function ensureSuggestView(): WebContentsView {
  if (suggestView) return suggestView;
  suggestView = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "preload-suggest.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  suggestView.setBackgroundColor("#00000000");
  suggestView.webContents.loadFile(path.join(__dirname, "ui", "suggest.html"));
  return suggestView;
}

function showSuggestions(list: Suggestion[], at: Rect) {
  suggestions = list;
  const v = ensureSuggestView();
  if (!list.length) return hideSuggestions();
  v.setBounds({ x: Math.round(at.x), y: Math.round(at.y + at.height + 4), width: Math.round(at.width), height: list.length * ROW_H + 12 });
  win.contentView.addChildView(v); // 이미 있으면 맨 위로
  v.webContents.send(IPC.suggestList, list, 0);
}

function hideSuggestions() {
  suggestions = [];
  if (suggestView && win.contentView.children.includes(suggestView)) win.contentView.removeChildView(suggestView);
}

/** 방문 기록 페이지 */
const openHistory = () => openInternal(HISTORY_URL);

function toggleBookmarkBar() {
  const s = loadSettings();
  saveSettings({ ...s, bookmarkBar: !s.bookmarkBar });
  setTimeout(pushUI, 50); // 설정 파일 쓰기 뒤에
}

/** 단축키: 툴바와 페이지 어느 쪽에 포커스가 있어도 동작 */
function handleShortcut(input: Input): boolean {
  if (input.type !== "keyDown" || !active) return false;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();
  const wc = active.view.webContents;
  const nav = wc.navigationHistory;
  const step = (d: number) => activate(tabs[(tabs.indexOf(active!) + d + tabs.length) % tabs.length]);
  if ((ctrl && key === "l") || input.key === "F6") win.webContents.send(IPC.focusAddress);
  else if (ctrl && input.shift && key === "b") toggleBookmarkBar();
  else if (ctrl && key === "d") toggleBookmark();
  else if (ctrl && key === "h") openHistory();
  else if (ctrl && input.shift && key === "o") openBookmarks();
  else if (ctrl && key === "t") openBlankTab();
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

function createWindow() {
  // Windows 가 다크 모드여도 앱은 밝은 모드가 기본 (제목 표시줄, 통일 화면, 사이트의 prefers-color-scheme 모두)
  // 다크 모드는 후순위: 나중에 설정 화면에서 "system" | "dark" 를 고를 수 있게 한다
  nativeTheme.themeSource = "light";

  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 480,
    minHeight: 400,
    title: "Kong Browser",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-ui.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.on("resize", layout);
  win.webContents.on("before-input-event", (e, input) => handleShortcut(input) && e.preventDefault());
  win.loadFile(path.join(__dirname, "ui", "index.html"));

  // 시작: 주소를 주고 실행하면 그 주소만, 아니면 지난번 탭들을 복원 (없으면 시작 페이지)
  const argUrl = process.argv.find((a) => /^https?:\/\//.test(a));
  const session = store.loadSession();
  if (argUrl) createTab(argUrl);
  else if (session.tabs.length) {
    session.tabs.forEach((u) => createTab(u, { activate: false }));
    activate(tabs[Math.min(Math.max(session.active, 0), tabs.length - 1)]);
  } else createTab(START_URL);

  // 테스트 자동화(Playwright)에서 상태를 읽을 수 있게: page/state 는 지금 탭의 것
  if (process.env.KONG_TEST)
    (globalThis as any).__kong = {
      win,
      get page() {
        return active?.view;
      },
      get state() {
        return active?.state;
      },
      get tabs() {
        return tabs.map((t) => ({ id: t.id, url: t.state.url, title: t.state.title, active: t === active }));
      },
      get suggest() {
        return { visible: !!suggestView && win.contentView.children.includes(suggestView), list: suggestions };
      },
    };
}

// ---------- 페이지 preload (어느 탭에서 왔는지는 보낸 쪽 webContents 로 안다) ----------

ipcMain.on(IPC.pageConfig, (e, url: string) => {
  const tab = tabOf(e.sender);
  const config: PageConfig = {
    recipes: tab ? recipes : [],
    off: !!tab && url === tab.originalUrl,
    navOpen: loadSettings().navOpen,
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

const current = () => active?.view.webContents;
ipcMain.on(IPC.ready, () => pushUI());
ipcMain.on(IPC.navigate, (_e, text: string) => current()?.loadURL(toUrl(text)));
ipcMain.on(IPC.back, () => current()?.navigationHistory.goBack());
ipcMain.on(IPC.forward, () => current()?.navigationHistory.goForward());
ipcMain.on(IPC.reload, () => current()?.reload());
ipcMain.on(IPC.stop, () => current()?.stop());
ipcMain.on(IPC.toggleOriginal, () => {
  if (!active) return;
  // 원본 보기 ↔ 통일 화면: 주입 여부만 바꿔서 새로고침
  active.originalUrl = active.originalUrl === active.state.url ? null : active.state.url;
  active.view.webContents.reload();
});
ipcMain.on(IPC.newTab, () => openBlankTab());
ipcMain.on(IPC.closeTab, (_e, id: number) => {
  const tab = tabs.find((t) => t.id === id);
  if (tab) closeTab(tab);
});
ipcMain.on(IPC.selectTab, (_e, id: number) => {
  const tab = tabs.find((t) => t.id === id);
  if (tab) activate(tab);
});
ipcMain.on(IPC.moveTab, (_e, id: number, to: number) => {
  const tab = tabs.find((t) => t.id === id);
  if (tab) moveTab(tab, to);
});
ipcMain.on(IPC.openUrl, (_e, url: string, where: "current" | "tab" | "background") => {
  if (where === "current") current()?.loadURL(url);
  else createTab(url, { activate: where === "tab", after: active });
});
ipcMain.on(IPC.toggleBookmark, () => toggleBookmark());
ipcMain.on(IPC.openHistory, () => openHistory());
// 북마크 바에서 오른쪽 클릭
ipcMain.on(IPC.bookmarkMenu, (_e, url: string) => {
  Menu.buildFromTemplate([
    { label: "새 탭에서 열기", click: () => createTab(url, { after: active }) },
    moveMenu(url),
    { type: "separator" },
    { label: "북마크 삭제", click: () => editBookmarks((d) => bm.remove(d, url)) },
    { label: "북마크 관리", click: openBookmarks },
  ]).popup({ window: win });
});
// ★ (이미 북마크된 페이지) 를 눌렀을 때
ipcMain.on(IPC.starMenu, (_e, at: Rect) => {
  if (!active) return;
  const url = active.state.url;
  Menu.buildFromTemplate([
    { label: "북마크됨", enabled: false },
    moveMenu(url),
    { type: "separator" },
    { label: "북마크 삭제", click: () => editBookmarks((d) => bm.remove(d, url)) },
    { label: "북마크 관리", click: openBookmarks },
  ]).popup({ window: win, x: Math.round(at.x), y: Math.round(at.y + at.height) });
});
// 북마크 바의 폴더를 눌렀을 때: 안의 북마크 (Ctrl+클릭 = 뒤쪽 새 탭)
ipcMain.on(IPC.folderMenu, (_e, id: string, at: Rect) => {
  const group = bm.tree(store.bookmarkData()).folders.find((g) => g.folder.id === id);
  if (!group) return;
  const items: Electron.MenuItemConstructorOptions[] = group.bookmarks.map((b) => ({
    label: b.title.length > 60 ? b.title.slice(0, 60) + "…" : b.title,
    click: (_i, _w, e) => (e.ctrlKey || e.metaKey ? createTab(b.url, { activate: false, after: active }) : current()?.loadURL(b.url)),
  }));
  if (!items.length) items.push({ label: "(비어 있음)", enabled: false });
  else
    items.push({ type: "separator" }, { label: "모두 새 탭에서 열기", click: () => group.bookmarks.forEach((b) => createTab(b.url, { activate: false, after: active })) });
  items.push({ label: "북마크 관리", click: openBookmarks });
  Menu.buildFromTemplate(items).popup({ window: win, x: Math.round(at.x), y: Math.round(at.y + at.height) });
});
ipcMain.on(IPC.openBookmarks, () => openBookmarks());

// 주소창 자동완성
ipcMain.handle(IPC.suggest, (_e, text: string, at: Rect) => {
  const d = store.bookmarkData();
  const list = suggest(text, {
    bookmarks: d.bookmarks.map((b) => ({ url: b.url, title: b.title, folder: bm.folderName(d, b.folder) ?? null })),
    history: store.historyEntries(),
  });
  showSuggestions(list, at);
  return list;
});
ipcMain.on(IPC.suggestSelect, (_e, i: number) => suggestView?.webContents.send(IPC.suggestList, suggestions, i));
ipcMain.on(IPC.suggestHide, () => hideSuggestions());
ipcMain.on(IPC.suggestChoose, (_e, url: string) => {
  hideSuggestions();
  current()?.loadURL(url);
  active?.view.webContents.focus();
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
  }
});

ipcMain.on(IPC.layout, (_e, box: { top: number }) => {
  const top = Math.ceil(box.top);
  if (top > 0 && top !== pageTop) {
    pageTop = top;
    layout();
  }
});

app.whenReady().then(createWindow);
app.on("before-quit", () => store.flush());
app.on("window-all-closed", () => {
  store.flush();
  app.quit();
});
