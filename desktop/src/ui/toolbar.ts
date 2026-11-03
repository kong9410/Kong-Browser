// 툴바: 탭 줄, 주소창(자동완성), 뒤로/앞으로/새로고침, 재배치 상태 표시, 원본 보기 전환, 북마크(폴더), 고장 배너
import type { KongUI } from "../preload-ui";
import type { Bookmark, BookmarkData, BrowserState, Rect, TabInfo } from "../shared";
import type { Suggestion } from "../suggest";

declare global {
  interface Window {
    kongUI: KongUI;
  }
}

const ui = window.kongUI;
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

let loading = false;
let editing = false;
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
// 탭 줄 빈 곳을 두 번 누르면 새 탭 (Chrome 과 같은 동작)
const tabstrip = tabsBox.parentElement!;
tabstrip.ondblclick = (e) => {
  if (e.target === tabstrip || e.target === tabsBox) ui.newTab();
};
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
ui.onFocusAddress(() => {
  address.focus();
  address.select();
});

/** 시작 페이지(file://)는 주소창에 표시하지 않는다 */
const displayUrl = (url: string) => (url.startsWith("file:") ? "" : url);

function setMode(text: string, cls: string) {
  mode.hidden = !text;
  mode.textContent = text;
  mode.className = `mode ${cls}`;
}

let activeId = -1;

ui.onState((s: BrowserState) => {
  renderTabs(s.tabs);
  // 다른 탭으로 바뀌면 주소창 편집 중이던 내용은 버리고 그 탭의 주소를 보여준다
  const now = s.tabs.find((t) => t.active)?.id ?? -1;
  if (now !== activeId) {
    activeId = now;
    editing = false;
  }
  back.disabled = !s.canGoBack;
  forward.disabled = !s.canGoForward;
  loading = s.loading;
  reload.classList.toggle("loading", s.loading);
  if (!editing) address.value = displayUrl(s.url);

  // 재배치 상태 표시
  if (s.original) setMode("원본", "original");
  else if (s.verdict === "ok" || s.verdict === "degraded") setMode("통일 화면", "unified");
  else if (s.verdict === "broken") setMode("원본", "broken");
  else setMode("", "");

  original.hidden = !s.hasRecipe;
  original.textContent = s.original ? "통일 화면으로" : "원본 보기";
  original.classList.toggle("active", s.original);

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
      el.className = "tab" + (t.active ? " active" : "") + (t.loading ? " loading" : "");
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(t.active));
      el.title = t.title || t.url;
      el.dataset.id = String(t.id);
      el.draggable = true;
      el.ondragstart = (e) => {
        dragId = t.id;
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", String(t.id));
        el.classList.add("dragging");
      };
      el.ondragend = () => {
        dragId = null;
        el.classList.remove("dragging");
        clearDropMark();
      };

      const icon = document.createElement("span");
      icon.className = "tab-icon";
      if (!t.loading && t.favicon) {
        const img = document.createElement("img");
        img.src = t.favicon;
        img.alt = "";
        img.onerror = () => img.remove();
        icon.appendChild(img);
      }
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
      el.append(icon, label, close);
      return el;
    }),
  );
}

// ---------- 탭 끌어서 순서 바꾸기 ----------

let dragId: number | null = null;
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
  if (dragId === null) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  clearDropMark();
  const others = Array.from(tabsBox.querySelectorAll<HTMLElement>(".tab")).filter((t) => Number(t.dataset.id) !== dragId);
  const i = dropIndex(e.clientX);
  if (others[i]) others[i].classList.add("drop-before");
  else others[others.length - 1]?.classList.add("drop-after");
};
tabsBox.ondrop = (e) => {
  if (dragId === null) return;
  e.preventDefault();
  ui.moveTab(dragId, dropIndex(e.clientX));
  clearDropMark();
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
  if (b.favicon) {
    const img = document.createElement("img");
    img.src = b.favicon;
    img.alt = "";
    img.onerror = () => img.remove();
    item.appendChild(img);
  }
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

/** 페이지 영역이 툴바 바로 아래에 오도록 main 에 알린다 (배너가 뜨면 툴바가 높아짐) */
function reportLayout() {
  ui.setLayout({ top: toolbar.offsetHeight });
}

ui.ready();
reportLayout();
