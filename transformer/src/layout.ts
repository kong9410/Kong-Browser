// ③ 재배치: 통일된 뼈대(#kong-root)를 만들고 원본 요소를 옮긴다.
// text 슬롯 = 원본 텍스트를 읽어 엔진이 만든 요소에 넣음 / move 슬롯 = 원본 노드를 통째로 이동 (이벤트·지연로딩 유지)
// 설계: docs/DESIGN.md 4절
import { findAll, hit } from "./locate.js";
import type { Hit, LocatedBoard, LocatedComment, LocatedHub, LocatedPost, LocatedRow } from "./locate.js";
import type { Field, Recipe } from "./recipe.js";
import { buildShell, ROOT_ID } from "./nav.js";
import { isVisited, markVisited } from "./visited.js";
import css from "./style.css";

export { ROOT_ID };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string | null) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

/** 원본 노드를 container 로 옮긴다. exclude 대상은 지우지 않고 숨긴다 (사이트 JS 가 찾을 수 있게) */
function moveInto(container: HTMLElement, el: Element | null | undefined, field?: Field): boolean {
  if (!el) return false;
  for (const sel of field?.exclude ?? []) {
    try {
      el.querySelectorAll(sel).forEach((e) => e.classList.add("k-excluded"));
    } catch {
      /* 잘못된 셀렉터 무시 */
    }
  }
  container.appendChild(el);
  return true;
}

function moveSlot(cls: string, h_: Hit | null, field?: Field): HTMLElement | null {
  if (!h_?.el) return null;
  const box = h("div", `${cls} k-move`);
  moveInto(box, h_.el, field);
  return box;
}

function meta(parts: (string | null | false | undefined)[]): HTMLElement {
  const box = h("div", "k-meta");
  for (const p of parts) if (p) box.appendChild(h("span", undefined, p));
  return box;
}

// ---------- 게시글 ----------

export interface PostView {
  kind: "post";
  root: HTMLElement;
  addComment(c: LocatedComment, best: boolean): void;
  /** 원본에서 사라진 댓글(사이트가 댓글 페이지를 바꾼 경우)을 뼈대에서도 지운다 */
  prune(): void;
  setCount(n: number): void;
  /** 댓글 수 머리글을 다시 계산 (사이트 표시값 우선, 없으면 목록 개수) */
  refreshCount(): void;
  /** 지금 뼈대에 있는 일반 댓글 수 */
  commentTotal(): number;
  /** 사이트가 댓글 영역을 다시 그렸을 때 뼈대를 복구 */
  ensure(): void;
}

export function buildPost(l: LocatedPost, recipe: Recipe): PostView {
  const p = l.page;
  const f = l.fields;
  const root = h("div");

  const head = h("header", "k-head");
  head.appendChild(h("div", "k-site", recipe.siteName));
  const title = h("h1", "k-title");
  if (f.category?.value) title.appendChild(h("span", "k-cat", f.category.value));
  title.appendChild(document.createTextNode(f.title?.value ?? ""));
  head.appendChild(title);
  head.appendChild(
    meta([
      f.author?.value,
      f.createdAt?.value,
      f.views?.value && `조회 ${f.views.value}`,
      f.likes?.value && `추천 ${f.likes.value}`,
    ]),
  );
  root.appendChild(head);

  for (const box of [
    moveSlot("k-body", f.body, p.body),
    moveSlot("k-actions", f.actions, p.actions),
    moveSlot("k-ad", f.ad, p.ad),
    // 사이트의 원래 [목록] 버튼: 본문 아래, 댓글 위 (사이트에 없으면 생략)
    moveSlot("k-list", f.listLink, p.listLink),
  ])
    if (box) root.appendChild(box);

  // 베스트 댓글: 기능이 없는 사이트(bestItem 없음)거나 0개면 섹션 자체를 만들지 않음
  const bestSection = h("section", "k-best k-gen");
  const bestList = h("div", "k-cmt-list");
  bestSection.append(h("h2", "k-sec-title", "베스트 댓글"), bestList);

  const cmtSection = h("section", "k-comments k-gen");
  const cmtTitle = h("h2", "k-sec-title", "댓글");
  const cmtList = h("div", "k-cmt-list");
  cmtSection.append(cmtTitle, cmtList);

  const src = h("a", "k-source", `원본 보기 · ${location.host}`);
  src.href = location.href;
  root.appendChild(src);
  const place = (el: Element) => root.insertBefore(el, src); // 원본 링크는 항상 맨 아래

  // 사이트가 댓글 버튼 이벤트를 상위 요소에 위임해 둔 경우(jQuery .on(selector) 등), 버튼을 그 밖으로 꺼내면 동작하지 않는다.
  // 그래서 그 상위 요소(anchor)를 통째로 뼈대에 옮기고, 원래 내용은 숨긴 채 그 "안에" 통일된 댓글 목록을 만든다.
  let anchor: HTMLElement | null = null;
  const adoptAnchor = () => {
    if (!p.comments?.anchor) return;
    if (!anchor?.isConnected) {
      anchor = document.querySelector(p.comments.anchor) as HTMLElement | null;
      if (!anchor) return;
      anchor.classList.add("k-anchor");
      if (!root.contains(anchor)) place(anchor);
    }
    for (const child of Array.from(anchor.children))
      if (!child.classList.contains("k-gen")) child.classList.add("k-hidden");
  };

  const moreBox = h("div", "k-more k-move");
  cmtSection.appendChild(moreBox);
  /** 댓글 페이지 버튼: 사이트가 댓글 영역을 다시 그리면 새 버튼이 숨겨진 원본 쪽에 생기므로 그걸로 교체 */
  const syncMore = () => {
    if (!p.comments?.more) return;
    const current = findAll(document, p.comments.more.sel).els.find((e) => !e.closest(".k-gen"));
    if (!current) return;
    moreBox.replaceChildren();
    moveInto(moreBox, current, p.comments.more);
  };

  /** 사이트가 anchor 안을 통째로 다시 그려(innerHTML 교체 등) 우리 섹션이 떨어져 나갔으면 다시 붙인다 */
  const ensureSections = () => {
    adoptAnchor();
    const host = anchor ?? root;
    if (p.comments && cmtSection.parentElement !== host) (host === root ? place(cmtSection) : host.appendChild(cmtSection));
    if (bestList.childElementCount && bestSection.parentElement !== host) host.insertBefore(bestSection, p.comments ? cmtSection : null);
  };
  ensureSections();
  syncMore();

  const sources = new Map<HTMLElement, Element>(); // 뼈대 댓글 → 원본 item

  const view: PostView = {
    kind: "post",
    root,
    addComment(c, best) {
      c.item.setAttribute("data-kong-done", "1");
      if (!c.content) return;
      const box = h("div", `k-cmt${c.isReply ? " k-reply" : ""}`);
      const top = h("div", "k-cmt-head");
      top.append(h("span", "k-who", c.who ?? "익명"), h("span", "k-when", c.when));
      box.appendChild(top);
      const body = h("div", "k-cmt-body k-move");
      moveInto(body, c.content, p.comments?.content);
      box.appendChild(body);
      if (c.actions) {
        const act = h("div", "k-cmt-actions k-move");
        moveInto(act, c.actions, p.comments?.actions);
        box.appendChild(act);
      }
      sources.set(box, c.item);
      if (best) {
        bestList.appendChild(box);
        ensureSections();
      } else {
        cmtList.appendChild(box);
      }
    },
    prune() {
      for (const [box, item] of sources)
        if (!item.isConnected) {
          box.remove();
          sources.delete(box);
        }
      if (!bestList.childElementCount) bestSection.remove();
    },
    refreshCount() {
      const n = hit(document, p.commentCount)?.value?.replace(/[^0-9]/g, "");
      view.setCount(n ? Number(n) : cmtList.childElementCount);
    },
    commentTotal: () => cmtList.childElementCount,
    setCount(n) {
      cmtTitle.textContent = `댓글 ${n}`;
    },
    ensure() {
      // 사이트가 댓글 영역을 다시 그린 경우(댓글 페이지 이동 등): 섹션 재부착, 새 원본 숨김, 새 페이지 버튼으로 교체
      ensureSections();
      syncMore();
    },
  };

  for (const c of l.best) view.addComment(c, true);
  for (const c of l.comments) view.addComment(c, false);
  view.refreshCount();

  view.root = buildShell(root, recipe, "post");
  return view;
}

// ---------- 게시판 ----------

export interface BoardView {
  kind: "board";
  root: HTMLElement;
  addRow(r: LocatedRow): void;
}

const MEDIA_SVG = {
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17.5l4.5-4.5 3 3 2.5-2.5 4 4"/>',
  video: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10.5 9.3v5.4l4.4-2.7z"/>',
};
/** 이미지·동영상이 있는 글 표시 (제목 뒤 작은 아이콘) */
function mediaIcon(kind: "image" | "video") {
  const s = h("span", `k-media k-media-${kind}`);
  s.title = kind === "image" ? "이미지" : "동영상";
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${MEDIA_SVG[kind]}</svg>`;
  return s;
}

export function buildBoard(l: LocatedBoard, recipe: Recipe): BoardView {
  const root = h("div");

  const head = h("header", "k-head");
  head.append(h("div", "k-site", recipe.siteName), h("h1", "k-title", l.boardName?.value ?? "게시판"));
  root.appendChild(head);

  const list = h("div", "k-rows");
  root.appendChild(list);

  const view: BoardView = {
    kind: "board",
    root,
    addRow(r) {
      r.item.setAttribute("data-kong-done", "1");
      if (!r.title || !r.href) return;
      const a = h("a", `k-row${r.notice ? " k-notice" : ""}`);
      a.href = r.href;
      // 읽은 글은 제목 색을 바꾼다 (사이트의 방문한 링크 색처럼)
      const params = l.page.rows.visitParams;
      if (isVisited(r.href, params)) a.classList.add("k-visited");
      a.addEventListener("click", () => {
        a.classList.add("k-visited");
        markVisited(a.href);
      });
      const t = h("div", "k-row-title");
      if (r.notice) t.appendChild(h("span", "k-badge", "공지"));
      if (r.category) t.appendChild(h("span", "k-cat", r.category.replace(/^\[|\]$/g, "")));
      t.appendChild(document.createTextNode(r.title));
      if (r.image) t.appendChild(mediaIcon("image"));
      if (r.video) t.appendChild(mediaIcon("video"));
      const n = r.commentCount?.replace(/[^0-9]/g, "");
      if (n && n !== "0") t.appendChild(h("span", "k-ccount", n));
      a.appendChild(t);
      a.appendChild(
        meta([r.author, r.createdAt, r.views && `조회 ${r.views}`, r.likes && r.likes !== "0" && `추천 ${r.likes}`]),
      );
      list.appendChild(a);
    },
  };
  for (const r of l.rows) view.addRow(r);

  for (const box of [moveSlot("k-more", l.more, l.page.more), moveSlot("k-pager", l.pager, l.page.pager)])
    if (box) root.appendChild(box);
  // 왼쪽 메뉴 열과 함께 두 열로 감싼다 (메뉴가 없는 사이트면 한 열 그대로)
  view.root = buildShell(root, recipe, "board");
  return view;
}

// ---------- 첫 화면 (게시판에 들어가기 전) ----------

/** 제목 + 광고만. 원본 내용(뉴스·추천글 등)은 숨겨진 채로 둔다 */
export function buildHub(l: LocatedHub, recipe: Recipe): HTMLElement {
  const root = h("div");
  const head = h("header", "k-head");
  head.append(h("div", "k-site", recipe.siteName), h("h1", "k-title", l.title?.value ?? recipe.siteName));
  root.appendChild(head);
  for (const ad of l.ads) {
    const box = h("div", "k-ad k-move");
    moveInto(box, ad, l.page.ads);
    root.appendChild(box);
  }
  return buildShell(root, recipe, "hub");
}

// ---------- 화면에 붙이기 ----------

export function mount(root: HTMLElement, hide: string[] = []) {
  const style = h("style");
  style.id = "kong-style";
  // hide 목록은 나중에 붙는 떠다니는 배너 등에도 적용되도록 CSS 규칙으로 건다
  style.textContent = css + hide.map((s) => `${s}{display:none!important}`).join("");
  (document.head ?? document.documentElement).appendChild(style);
  document.documentElement.classList.add("kong-on");

  // 지금 있는 원본 화면만 숨긴다. 이후 사이트가 body 에 붙이는 팝업(이미지 뷰어, 알림 등)은 그대로 보이게
  for (const child of Array.from(document.body.children)) child.classList.add("k-hidden");
  document.body.appendChild(root);
}

export function isDone(item: Element) {
  return item.getAttribute("data-kong-done") === "1";
}
