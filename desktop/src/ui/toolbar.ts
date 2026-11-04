// 툴바: 탭 줄, 주소창(자동완성), 뒤로/앞으로/새로고침, 재배치 상태 표시, 원본 보기 전환, 북마크(폴더), 고장 배너
import type { KongUI } from "../preload-ui";
import type { Bookmark, BookmarkData, BrowserState, Rect, TabInfo } from "../shared";
import { DOCK_SITES, dockSiteOf, faviconOf, openTarget } from "../dock";
import { iconFor, type BuiltinIcon, type IconChoice } from "../favicon";
import type { Suggestion } from "../suggest";
import { failedUrlOf } from "../error-page";

/** 앱이 가진 아이콘: 사이트 아이콘이 없거나 못 불러올 때, 그리고 앱 안쪽 페이지 */
const BUILTIN: Record<BuiltinIcon, string> = {
  home: `<svg viewBox="0 0 24 24"><path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5"/></svg>`,
  history: `<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4M12 7.5V12l3 2"/></svg>`,
  bookmarks: `<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  downloads: `<svg viewBox="0 0 24 24"><path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5.5 19.5h13"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  page: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.3 3.6 5.2 3.6 8.5s-1.1 6.2-3.6 8.5c-2.5-2.3-3.6-5.2-3.6-8.5s1.1-6.2 3.6-8.5z"/></svg>`,
};

/** 아이콘 칸 채우기: 사이트 아이콘 이미지, 불러오지 못하면 앱 아이콘으로 바꾼다 */
function fillIcon(box: HTMLElement, choice: IconChoice) {
  box.replaceChildren();
  if ("builtin" in choice) {
    box.innerHTML = BUILTIN[choice.builtin];
    return;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.src = choice.src;
  img.onerror = () => (box.innerHTML = BUILTIN[choice.fallback]);
  box.appendChild(img);
}

declare global {
  interface Window {
    kongUI: KongUI;
  }
}

const ui = window.kongUI;
// 운영체제별 탭 줄 배치 (macOS 는 창 버튼이 왼쪽, Windows 는 오른쪽): toolbar.css
document.documentElement.dataset.platform = ui.platform;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const back = $<HTMLButtonElement>("back");
const forward = $<HTMLButtonElement>("forward");
const reload = $<HTMLButtonElement>("reload");
const form = $<HTMLFormElement>("address-form");
const address = $<HTMLInputElement>("address");
const mode = $("mode");
const original = $<HTMLButtonElement>("original");
const banner = $("banner");
const toolbar = $("toolbar");
const bannerDetail = $("banner-detail");
const tabsBox = $("tabs");
const newTab = $<HTMLButtonElement>("new-tab");
const bookmarkBtn = $<HTMLButtonElement>("bookmark");
const historyBtn = $<HTMLButtonElement>("history");
const bookmarkBar = $("bookmark-bar");
const dock = $("dock");
const dockToggle = $<HTMLButtonElement>("dock-toggle");
const downloadsBtn = $<HTMLButtonElement>("downloads");
const zoomBtn = $<HTMLButtonElement>("zoom");

let loading = false;
let editing = false;
/**
 * 방금 이동을 시작한 주소 (Enter·자동완성): 페이지가 바뀌기 전까지 주소창에 이 값을 보인다
 * (안 그러면 이동이 끝날 때까지 이전 페이지 주소가 잠깐 다시 보임)
 */
let pending: { text: string; from: string; sawLoading: boolean; at: number } | null = null;
let currentUrl = "";
const startPending = (text: string) => (pending = { text, from: currentUrl, sawLoading: false, at: Date.now() });
let bookmarked = false;

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

back.onclick = () => ui.back();
forward.onclick = () => ui.forward();
reload.onclick = () => (loading ? ui.stop() : ui.reload());
original.onclick = () => ui.toggleOriginal();
newTab.onclick = () => ui.newTab();
// ☆ = 북마크 추가, ★ = 폴더로 이동 / 삭제 / 관리 메뉴
bookmarkBtn.onclick = () => (bookmarked ? ui.starMenu(rectOf(bookmarkBtn)) : ui.toggleBookmark());
historyBtn.onclick = () => ui.openHistory();
$<HTMLButtonElement>("settings").onclick = () => ui.openSettings();
downloadsBtn.onclick = () => {
  const r = downloadsBtn.getBoundingClientRect();
  ui.downloadsMenu({ x: r.x, y: r.y, width: r.width, height: r.height });
};
dockToggle.onclick = () => ui.toggleDock();
// 주소창의 확대/축소 표시: 누르면 기본 크기로
zoomBtn.onclick = () => ui.zoomReset();
// ---------- 주소창 + 자동완성 ----------
// 목록은 main 이 페이지 위에 띄우는 별도 창에 그린다. 여기서는 입력과 선택 위치만 관리한다.
let suggestions: Suggestion[] = [];
let selected = 0;
let suggestTimer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

function closeSuggestions() {
  clearTimeout(suggestTimer);
  seq++; // 늦게 도착한 후보는 버린다
  suggestions = [];
  ui.suggestHide();
}

form.onsubmit = (e) => {
  e.preventDefault();
  if (!address.value.trim()) return;
  editing = false;
  // 고른 후보가 있으면 그 주소로 (첫 줄 = 입력한 그대로 이동/검색)
  const chosen = suggestions[selected];
  closeSuggestions();
  if (chosen) ui.openUrl(chosen.url, "current");
  else ui.navigate(address.value);
  startPending(chosen ? displayUrl(chosen.url) : address.value.trim());
  address.blur();
};
address.onfocus = () => {
  editing = true;
  address.select();
};
address.onblur = () => {
  editing = false;
  // 목록을 마우스로 누르는 경우를 위해 조금 늦게 닫는다 (목록 쪽은 mousedown 에서 바로 고름)
  setTimeout(closeSuggestions, 150);
};
address.oninput = () => {
  clearTimeout(suggestTimer);
  const text = address.value;
  if (!text.trim()) return closeSuggestions();
  suggestTimer = setTimeout(async () => {
    const mine = ++seq;
    const list = await ui.suggest(text, rectOf(form));
    if (mine !== seq) return;
    suggestions = list;
    selected = 0;
  }, 60);
};
address.onkeydown = (e) => {
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length) {
    e.preventDefault();
    const n = suggestions.length;
    selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    ui.suggestSelect(selected);
  } else if (e.key === "Escape") {
    // 목록이 있으면 목록만 닫고, 없으면 주소창을 빠져나간다
    if (suggestions.length) closeSuggestions();
    else {
      editing = false;
      address.blur();
    }
  }
};
// 자동완성 목록에서 마우스로 골라 이동: 주소창 입력을 끝내고 이동할 주소를 보인다 (커서는 페이지로)
ui.onAddressDone((url) => {
  clearTimeout(suggestTimer);
  seq++;
  suggestions = [];
  editing = false;
  startPending(displayUrl(url));
  address.value = pending!.text;
  address.blur();
});
ui.onFocusAddress((keep) => {
  if (keep && document.activeElement === address) return;
  address.focus();
  address.select();
});

/** 시작 페이지(file://)는 주소창에 표시하지 않는다 */
/** 오류 화면이면 원래 열려던 주소를 보인다 */
const displayUrl = (url: string) => failedUrlOf(url) ?? (url.startsWith("file:") ? "" : url);

function setMode(text: string, cls: string) {
  mode.hidden = !text;
  mode.textContent = text;
  mode.className = `mode ${cls}`;
}

let activeId = -1;

ui.onState((s: BrowserState) => {
  renderTabs(s.tabs);
  document.documentElement.classList.toggle("fullscreen", s.fullscreen);
  markDock(s.url);
  showDock(s.dockOpen);
  showDownloads(s.downloads);
  // 다른 탭으로 바뀌면 주소창 편집 중이던 내용은 버리고 그 탭의 주소를 보여준다
  const now = s.tabs.find((t) => t.active)?.id ?? -1;
  if (now !== activeId) {
    activeId = now;
    editing = false;
    pending = null;
  }
  currentUrl = s.url;
  // 이동을 시작한 주소는 페이지가 바뀌거나(주소가 달라짐) 불러오기가 끝날 때까지 보인다
  if (pending) {
    if (s.loading) pending.sawLoading = true;
    if (s.url !== pending.from || (pending.sawLoading && !s.loading) || Date.now() - pending.at > 15000) pending = null;
  }
  back.disabled = !s.canGoBack;
  forward.disabled = !s.canGoForward;
  loading = s.loading;
  reload.classList.toggle("loading", s.loading);
  if (!editing) address.value = pending ? pending.text : displayUrl(s.url);

  // 재배치 상태 표시
  if (s.original) setMode("원본", "original");
  else if (s.verdict === "ok" || s.verdict === "degraded") setMode("통합 화면", "unified");
  else if (s.verdict === "broken") setMode("원본", "broken");
  else setMode("", "");

  // 확대/축소: 100% 가 아니면 주소창 안에 배율 (Ctrl+0 또는 눌러서 기본으로)
  const zoomed = Math.abs(s.zoom - 1) > 0.001;
  zoomBtn.hidden = !zoomed;
  zoomBtn.textContent = `${Math.round(s.zoom * 100)}%`;
  zoomBtn.title = `확대/축소 ${Math.round(s.zoom * 100)}% — 누르면 기본 크기(100%)로 (Ctrl+0)`;

  original.hidden = !s.hasRecipe;
  // 토글: 켜진 쪽이 지금 화면 (원본 | 통합)
  original.classList.toggle("is-original", s.original);
  original.setAttribute("aria-checked", String(s.original));

  // 북마크 ☆/★: 웹 페이지에서만
  bookmarkBtn.hidden = !/^https?:/.test(s.url);
  bookmarked = s.bookmarked;
  bookmarkBtn.classList.toggle("on", s.bookmarked);
  bookmarkBtn.title = s.bookmarked ? "북마크 편집: 폴더로 이동 / 삭제 (Ctrl+D 로 바로 삭제)" : "북마크 추가 (Ctrl+D)";
  renderBookmarks(s.bookmarkBar ? s.bookmarks : null);

  const broken = s.verdict === "broken" && !s.original;
  banner.hidden = !broken;
  bannerDetail.textContent = broken && s.failed.length ? `(${s.failed.join(", ")})` : "";

  reportLayout();
});

// ---------- 탭 줄 ----------

let lastTabs = "";
function renderTabs(tabs: TabInfo[]) {
  const json = JSON.stringify(tabs);
  if (json === lastTabs) return;
  lastTabs = json;
  tabsBox.replaceChildren(
    ...tabs.map((t) => {
      const el = document.createElement("div");
      el.className = "tab" + (t.active ? " active" : "") + (t.loading ? " loading" : "") + (t.pinned ? " pinned" : "");
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(t.active));
      el.title = t.title || t.url;
      el.dataset.id = String(t.id);
      el.draggable = true;
      el.ondragstart = (e) => {
        dragId = t.id;
        e.dataTransfer!.effectAllowed = "move";
        // 다른 창의 탭 줄도 이 탭을 알아보도록 (창 사이 끌기)
        e.dataTransfer!.setData(TAB_MIME, String(t.id));
        e.dataTransfer!.setData("text/plain", String(t.id));
        el.classList.add("dragging");
      };
      el.ondragend = () => {
        dragId = null;
        el.classList.remove("dragging");
        clearDropMark();
        // 탭 줄 밖에 놓았으면 main 이 새 창으로 떼어 낸다 (다른 창 탭 줄에 놓였으면 그쪽이 이미 옮김)
        ui.tabDragEnd(t.id);
      };

      const icon = document.createElement("span");
      icon.className = "tab-icon";
      if (!t.loading) fillIcon(icon, iconFor(t.url, t.favicon)); // 로딩 중에는 도는 표시 (CSS)
      const label = document.createElement("span");
      label.className = "tab-title";
      label.textContent = t.title || displayUrl(t.url) || "새 탭";
      const close = document.createElement("button");
      close.className = "tab-close";
      close.title = "탭 닫기 (Ctrl+W)";
      close.setAttribute("aria-label", "탭 닫기");
      close.textContent = "×";

      el.onmousedown = (e) => {
        if (e.button === 0 && e.target !== close) ui.selectTab(t.id);
      };
      // 가운데 버튼 클릭으로 닫기
      el.onauxclick = (e) => {
        if (e.button === 1) ui.closeTab(t.id);
      };
      close.onclick = (e) => {
        e.stopPropagation();
        ui.closeTab(t.id);
      };
      el.oncontextmenu = (e) => {
        e.preventDefault();
        ui.tabMenu(t.id);
      };
      el.append(icon, label);
      // 소리 나는 탭·음소거한 탭: 스피커 아이콘 (누르면 음소거 켜기/끄기)
      if (t.audible || t.muted) {
        const sound = document.createElement("button");
        sound.className = "tab-sound" + (t.muted ? " muted" : "");
        sound.title = t.muted ? "음소거 해제" : "이 탭 음소거";
        sound.setAttribute("aria-label", sound.title);
        sound.innerHTML = t.muted ? SPEAKER_OFF : SPEAKER_ON;
        sound.onmousedown = (e) => e.stopPropagation();
        sound.onclick = (e) => {
          e.stopPropagation();
          ui.toggleMute(t.id);
        };
        el.append(sound);
      }
      if (!t.pinned) el.append(close);
      return el;
    }),
  );
}

const SPEAKER_ON = `<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;
const SPEAKER_OFF = `<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;

// ---------- 탭 끌어서 순서 바꾸기 ----------

/** 이 창에서 끌고 있는 탭 (다른 창에서 끌어 온 탭이면 null) */
let dragId: number | null = null;
const TAB_MIME = "application/x-kong-tab";
/** 끌고 있는 것이 (어느 창이든) 우리 탭인지 */
const isTabDrag = (e: DragEvent) => dragId !== null || !!e.dataTransfer?.types.includes(TAB_MIME);
/** 마우스 x 위치로 놓을 자리(끌고 있는 탭을 뺀 순서에서의 위치)를 구한다 */
function dropIndex(x: number): number {
  const others = Array.from(tabsBox.querySelectorAll<HTMLElement>(".tab")).filter((t) => Number(t.dataset.id) !== dragId);
  return others.filter((t) => {
    const r = t.getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
}
function clearDropMark() {
  tabsBox.querySelectorAll(".drop-before, .drop-after").forEach((t) => t.classList.remove("drop-before", "drop-after"));
}
tabsBox.ondragover = (e) => {
  if (!isTabDrag(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  clearDropMark();
  const others = Array.from(tabsBox.querySelectorAll<HTMLElement>(".tab")).filter((t) => Number(t.dataset.id) !== dragId);
  const i = dropIndex(e.clientX);
  if (others[i]) others[i].classList.add("drop-before");
  else others[others.length - 1]?.classList.add("drop-after");
};
tabsBox.ondrop = (e) => {
  if (!isTabDrag(e)) return;
  e.preventDefault();
  const id = dragId ?? Number(e.dataTransfer!.getData(TAB_MIME));
  // 같은 창이면 순서 바꾸기, 다른 창의 탭이면 이 창의 이 자리로 옮김 (창 합치기)
  if (id) ui.moveTab(id, dropIndex(e.clientX));
  clearDropMark();
};
tabsBox.ondragleave = (e) => {
  if (!tabsBox.contains(e.relatedTarget as Node | null)) clearDropMark();
};

// ---------- 북마크 바 ----------

let lastBookmarks = "";
/** 북마크 바: 폴더 먼저(누르면 안의 북마크 메뉴), 그 뒤에 북마크 바에 바로 놓인 북마크. null 이면 숨김(Ctrl+Shift+B) */
function renderBookmarks(data: BookmarkData | null) {
  const json = JSON.stringify(data);
  if (json === lastBookmarks) return;
  lastBookmarks = json;
  const root = data ? data.bookmarks.filter((b) => !b.folder) : [];
  const folders = data ? data.folders : [];
  bookmarkBar.hidden = root.length + folders.length === 0;
  bookmarkBar.replaceChildren(
    ...folders.map((f) => {
      const item = document.createElement("button");
      item.className = "bm folder";
      item.title = f.name;
      item.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>`;
      const label = document.createElement("span");
      label.textContent = f.name;
      item.appendChild(label);
      item.onclick = () => ui.folderMenu(f.id, rectOf(item));
      item.oncontextmenu = (e) => {
        e.preventDefault();
        ui.openBookmarks(); // 폴더 이름 바꾸기·삭제는 북마크 관리에서
      };
      return item;
    }),
    ...root.map((b) => bookmarkItem(b)),
  );
  reportLayout(); // 북마크 바가 생기거나 없어지면 툴바 높이가 바뀐다
}

function bookmarkItem(b: Bookmark): HTMLElement {
  const item = document.createElement("button");
  item.className = "bm";
  item.title = `${b.title}\n${b.url}`;
  const icon = document.createElement("span");
  icon.className = "bm-icon";
  fillIcon(icon, iconFor(b.url, b.favicon));
  item.appendChild(icon);
  const label = document.createElement("span");
  label.textContent = b.title;
  item.appendChild(label);
  // 클릭 = 지금 탭, Ctrl+클릭·가운데 클릭 = 뒤쪽 새 탭, 오른쪽 클릭 = 메뉴(새 탭에서 열기 / 폴더로 이동 / 삭제)
  item.onclick = (e) => ui.openUrl(b.url, e.ctrlKey || e.metaKey ? "background" : "current");
  item.onauxclick = (e) => {
    if (e.button === 1) ui.openUrl(b.url, "background");
  };
  item.oncontextmenu = (e) => {
    e.preventDefault();
    ui.bookmarkMenu(b.url);
  };
  return item;
}

// ---------- 오른쪽 dock: 국내 주요 커뮤니티 ----------

function renderDock() {
  // 맨 아래 숨기기 버튼 (다시 보이기는 툴바의 dock 버튼)
  const hide = document.createElement("button");
  hide.className = "dock-hide";
  hide.title = "dock 숨기기";
  hide.setAttribute("aria-label", "dock 숨기기");
  hide.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>';
  hide.onclick = () => ui.toggleDock();
  dock.replaceChildren(
    ...DOCK_SITES.map((site) => {
      const b = document.createElement("button");
      b.className = "dock-item";
      b.title = `${site.name}
${site.url}`;
      b.setAttribute("aria-label", site.name);
      b.dataset.domain = site.domain;
      const img = document.createElement("img");
      img.alt = "";
      img.src = faviconOf(site);
      // 아이콘을 못 불러오면 첫 글자 배지
      img.onerror = () => {
        const badge = document.createElement("span");
        badge.className = "dock-badge";
        badge.style.background = site.color;
        badge.textContent = site.name.charAt(0);
        img.replaceWith(badge);
      };
      b.appendChild(img);
      // 클릭 = 지금 탭, Ctrl+클릭·가운데 클릭 = 뒤쪽 새 탭
      b.onclick = (e) => ui.openUrl(site.url, openTarget(e));
      b.onauxclick = (e) => {
        if (e.button === 1) ui.openUrl(site.url, openTarget(e));
      };
      return b;
    }),
    hide,
  );
}
/** 다운로드 버튼: 한 번이라도 받으면 나타나고, 받는 중이면 둘레에 진행 고리 (크기를 모르면 도는 고리) */
function showDownloads(d: BrowserState["downloads"]) {
  downloadsBtn.hidden = !d;
  if (!d) return;
  const on = d.active > 0;
  downloadsBtn.classList.toggle("active", on);
  downloadsBtn.classList.toggle("indeterminate", on && d.ratio === null);
  downloadsBtn.style.setProperty("--dl", String(Math.round((d.ratio ?? 0.25) * 100)));
  downloadsBtn.title = on ? `다운로드 중 ${d.active}개${d.ratio !== null ? ` · ${Math.floor(d.ratio * 100)}%` : ""}` : "다운로드";
}
/** dock 보이기/숨기기 (설정에 기억). 숨기면 페이지가 오른쪽 끝까지 */
function showDock(open: boolean) {
  dock.hidden = !open;
  dockToggle.classList.toggle("on", open);
  dockToggle.setAttribute("aria-pressed", String(open));
  dockToggle.title = dockToggle.ariaLabel = open ? "커뮤니티 dock 숨기기" : "커뮤니티 dock 보이기";
}
/** 지금 보고 있는 사이트를 dock 에서 강조 */
function markDock(url: string) {
  const domain = dockSiteOf(url)?.domain;
  dock.querySelectorAll<HTMLElement>(".dock-item").forEach((b) => b.classList.toggle("on", b.dataset.domain === domain));
}
renderDock();

/** 페이지 영역이 툴바 바로 아래, dock 왼쪽에 오도록 main 에 알린다 (배너·북마크 바가 생기면 툴바가 높아짐) */
function reportLayout() {
  document.documentElement.style.setProperty("--toolbar-h", `${toolbar.offsetHeight}px`);
  ui.setLayout({ top: toolbar.offsetHeight, right: dock.offsetWidth });
}

ui.ready();
reportLayout();
