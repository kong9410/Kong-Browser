// 통일 화면의 왼쪽 메뉴 열과 오른쪽 열 (설계 8-2절).
// 게시글/목록 본문과 같은 방식으로, 사이트의 메뉴(루리웹 상단 메뉴·게시판 메뉴, 디시 최근 방문)를 읽어 화면 왼쪽에 다시 배치한다.
// 원래 메뉴는 원본 화면과 함께 숨겨진다. 링크는 원래 주소 그대로라 누르면 일반 링크처럼 이동한다.
//
//   #kong-root (최대 세 열, CSS grid)
//   ├─ header.k-top       맨 위 줄: 사이트 로고 (누르면 사이트 홈)
//   ├─ aside.k-nav       왼쪽 메뉴 열 (접을 수 있음)
//   ├─ button.k-nav-open  접혀 있을 때만 보이는 [☰ 메뉴]
//   ├─ div.k-main         게시글/목록 (기존 통일 화면)
//   └─ aside.k-side       오른쪽 열: 루리웹 게시판 BEST, 디시 전체글/개념글/공지·말머리 (창이 좁으면 본문 아래로)
import { findAll, hit } from "./locate.js";
import { placeKept } from "./keep.js";
import { siteMark } from "./logo.js";
import { extractMenu, readLinks } from "./menu.js";
import type { Menu, MenuGroup, Recipe, SideBlock } from "./recipe.js";

export const ROOT_ID = "kong-root";

export interface NavOptions {
  /** 처음에 메뉴를 펼쳐 둘지 (앱이 기억한 값). 기본 true */
  open?: boolean;
  /** 사용자가 접거나 펼쳤을 때 (앱이 기억하도록) */
  onToggle?: (open: boolean) => void;
}

let options: NavOptions = {};
export function setNavOptions(o: NavOptions) {
  options = o;
}

let refresher: (() => void) | null = null;
/** 사이트가 메뉴를 늦게 채우는 경우(디시 최근 방문 등) 감시에서 호출 → 바뀌었으면 다시 그림 */
export function refreshNav() {
  refresher?.();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string | null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function link(text: string, href: string | null, current: boolean, cls: string): HTMLElement {
  const a = el(href ? "a" : "div", cls + (current ? " k-current" : ""), text);
  if (href && a instanceof HTMLAnchorElement) {
    a.href = href;
    a.title = text;
  }
  return a;
}

function render(list: HTMLElement, menu: Pick<Menu, "groups">) {
  list.replaceChildren();
  for (const g of menu.groups) {
    const section = el("section", `k-nav-group k-nav-${g.style}`);
    if (g.title) section.appendChild(link(g.title, g.href, g.current, "k-nav-title"));
    const items = el("div", "k-nav-items");
    for (const l of g.links) items.appendChild(link(l.text, l.href, l.current, "k-nav-link"));
    if (g.links.length) section.appendChild(items);
    list.appendChild(section);
  }
}

/** 폰 크기 화면 (style.css 의 폰 배치와 같은 기준) */
export const PHONE_MAX = 760;
const isPhone = () => window.matchMedia?.(`(max-width: ${PHONE_MAX}px)`).matches ?? false;

/** 본문(main)을 감싸 두 열짜리 #kong-root 를 만든다. 레시피에 menu 가 없거나 읽은 메뉴가 없으면 한 열 그대로 */
export function buildShell(main: HTMLElement, recipe: Recipe, page: "post" | "board" | "hub"): HTMLElement {
  const root = el("div");
  root.id = ROOT_ID;
  root.dataset.page = page;
  main.classList.add("k-main");

  const nav = el("aside", "k-nav");
  const head = el("div", "k-nav-head");
  const close = el("button", "k-nav-close", "접기");
  close.type = "button";
  close.title = "메뉴 접기";
  head.append(el("span", "k-nav-site", recipe.siteName), close);
  const list = el("nav", "k-nav-list");
  nav.append(head, list);

  const open = el("button", "k-nav-open", "☰ 메뉴");
  open.type = "button";
  open.title = "메뉴 펼치기";

  const setOpen = (v: boolean, user: boolean) => {
    root.classList.toggle("k-nav-closed", !v);
    if (user) options.onToggle?.(v);
  };
  // 폰(좁은 화면)에서는 메뉴가 본문 위에 덮이는 서랍. 열고 닫은 상태는 기억하지 않는다 (PC 의 펼침 설정과 별개)
  const backdrop = el("div", "k-nav-backdrop");
  const setDrawer = (v: boolean) => root.classList.toggle("k-drawer", v);
  backdrop.onclick = () => setDrawer(false);
  close.onclick = () => (isPhone() ? setDrawer(false) : setOpen(false, true));
  open.onclick = () => (isPhone() ? setDrawer(true) : setOpen(true, true));

  let last = "";
  const draw = () => {
    const menu = extractMenu(recipe);
    const json = JSON.stringify(menu);
    if (json === last) return;
    last = json;
    root.classList.toggle("k-has-nav", !!menu);
    if (menu) render(list, menu);
  };
  refresher = draw;

  // ---------- 오른쪽 열 ----------
  const side = el("aside", "k-side");
  const sideLinks: { box: HTMLElement; block: SideBlock }[] = [];
  for (const block of recipe.side ?? []) {
    if (block.move) {
      // 사이트 요소를 그대로 옮김: 버튼·말머리처럼 사이트 동작이 필요한 것
      const found = hit(document, block.move)?.el;
      if (!found) continue;
      const keep = !!block.move.keepStyle;
      const section = el("section", keep ? "k-side-keep k-keep" : "k-side-block k-move");
      if (block.title) section.appendChild(el("div", "k-side-title", block.title));
      for (const sel of block.reveal ?? []) findAll(found, [sel]).els.forEach((e) => e.classList.add("k-revealed"));
      for (const sel of block.hide ?? []) findAll(found, [sel]).els.forEach((e) => e.classList.add("k-excluded"));
      if (keep) placeKept(section, found);
      else section.appendChild(found);
      side.appendChild(section);
    } else if (block.links) {
      // 링크를 읽어 다시 그림 (사이트가 늦게 채우면 refresh 로 다시 그림)
      const box = el("section", "k-side-block k-nav-list");
      sideLinks.push({ box, block });
      side.appendChild(box);
    }
  }
  let lastSide = "";
  const drawSide = () => {
    const groups: MenuGroup[][] = sideLinks.map(({ block }) => readLinks(block.links!, recipe));
    const json = JSON.stringify(groups);
    if (json === lastSide) return;
    lastSide = json;
    sideLinks.forEach(({ box }, i) => {
      render(box, { groups: groups[i] });
      box.hidden = !groups[i].length;
    });
    root.classList.toggle("k-has-side", side.querySelector(":is(.k-side-block, .k-side-keep):not([hidden])") !== null);
  };
  refresher = () => {
    draw();
    drawSide();
  };

  // 맨 위 줄: 사이트 로고 (누르면 사이트 홈). 세 열 전체 폭
  const top = el("header", "k-top");
  top.appendChild(siteMark(recipe));
  // 오른쪽: 사이트 계정 영역 (로그인 등)
  const account = hit(document, recipe.account)?.el;
  if (account) {
    const box = el("div", "k-account " + (recipe.account?.keepStyle ? "k-keep" : "k-move"));
    // 계정 영역에서 뺄 것 (레시피 exclude: 예) 뮬의 다크모드·알림 아이콘)
    for (const sel of recipe.account?.exclude ?? [])
      try {
        account.querySelectorAll(sel).forEach((e) => e.classList.add("k-excluded"));
      } catch {
        /* 잘못된 셀렉터 무시 */
      }
    if (recipe.account?.keepStyle) placeKept(box, account);
    else box.appendChild(account);
    top.appendChild(box);
  }

  root.append(top, nav, backdrop, open, main, side);
  draw();
  drawSide();
  setOpen(options.open ?? true, false);
  return root;
}

/** 지금 위치가 보이도록 메뉴 열을 스크롤 (화면에 붙인 뒤 호출) */
export function revealCurrent() {
  document.querySelector(`#${ROOT_ID} .k-nav .k-current`)?.scrollIntoView({ block: "nearest" });
}
