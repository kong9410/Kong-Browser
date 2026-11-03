// 툴바: 탭 줄, 주소창, 뒤로/앞으로/새로고침, 재배치 상태 표시, 원본 보기 전환, 고장 배너
import type { KongUI } from "../preload-ui";
import type { Bookmark, BrowserState, TabInfo } from "../shared";

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

back.onclick = () => ui.back();
forward.onclick = () => ui.forward();
reload.onclick = () => (loading ? ui.stop() : ui.reload());
original.onclick = () => ui.toggleOriginal();
newTab.onclick = () => ui.newTab();
bookmarkBtn.onclick = () => ui.toggleBookmark();
historyBtn.onclick = () => ui.openHistory();
// 탭 줄 빈 곳을 두 번 누르면 새 탭 (Chrome 과 같은 동작)
const tabstrip = tabsBox.parentElement!;
tabstrip.ondblclick = (e) => {
  if (e.target === tabstrip || e.target === tabsBox) ui.newTab();
};
form.onsubmit = (e) => {
  e.preventDefault();
  if (!address.value.trim()) return;
  editing = false;
  ui.navigate(address.value);
  address.blur();
};
address.onfocus = () => {
  editing = true;
  address.select();
};
address.onblur = () => (editing = false);
address.onkeydown = (e) => {
  if (e.key === "Escape") {
    editing = false;
    address.blur();
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
  bookmarkBtn.classList.toggle("on", s.bookmarked);
  bookmarkBtn.title = s.bookmarked ? "북마크 삭제 (Ctrl+D)" : "북마크 추가 (Ctrl+D)";
  renderBookmarks(s.bookmarkBar ? s.bookmarks : []);

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
function renderBookmarks(list: Bookmark[]) {
  const json = JSON.stringify(list);
  if (json === lastBookmarks) return;
  lastBookmarks = json;
  bookmarkBar.hidden = list.length === 0;
  bookmarkBar.replaceChildren(
    ...list.map((b) => {
      const item = document.createElement("button");
      item.className = "bm";
      item.title = `${b.title}
${b.url}`;
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
      // 클릭 = 지금 탭, Ctrl+클릭·가운데 클릭 = 뒤쪽 새 탭, 오른쪽 클릭 = 메뉴(새 탭에서 열기 / 삭제)
      item.onclick = (e) => ui.openUrl(b.url, e.ctrlKey || e.metaKey ? "background" : "current");
      item.onauxclick = (e) => {
        if (e.button === 1) ui.openUrl(b.url, "background");
      };
      item.oncontextmenu = (e) => {
        e.preventDefault();
        ui.bookmarkMenu(b.url);
      };
      return item;
    }),
  );
  reportLayout(); // 북마크 바가 생기거나 없어지면 툴바 높이가 바뀐다
}

/** 페이지 영역이 툴바 바로 아래에 오도록 main 에 알린다 (배너가 뜨면 툴바가 높아짐) */
function reportLayout() {
  ui.setLayout({ top: toolbar.offsetHeight });
}

ui.ready();
reportLayout();
