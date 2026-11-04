// ③ 재배치: 통일된 뼈대(#kong-root)를 만들고 원본 요소를 옮긴다.
// text 슬롯 = 원본 텍스트를 읽어 엔진이 만든 요소에 넣음 / move 슬롯 = 원본 노드를 통째로 이동 (이벤트·지연로딩 유지)
// 설계: docs/DESIGN.md 4절
import { findAll, hit, locateBoard } from "./locate.js";
import type { Hit, LocatedBoard, LocatedComment, LocatedHub, LocatedPost, LocatedRow } from "./locate.js";
import type { BoardPage, Field, FitSpec, PostList, Recipe } from "./recipe.js";
import { CTX_CLASS, inContext, placeKept } from "./keep.js";
import { buildShell, ROOT_ID } from "./nav.js";
import { heroMark } from "./logo.js";
import { mirrorInto } from "./mirror.js";
import { isVisited, markVisited, visitKey } from "./visited.js";
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
  const mark = (sels: string[] | undefined, cls: string) => {
    for (const sel of sels ?? []) {
      try {
        el.querySelectorAll(sel).forEach((e) => e.classList.add(cls));
      } catch {
        /* 잘못된 셀렉터 무시 */
      }
    }
  };
  mark(field?.exclude, "k-excluded");
  mark(field?.raw, "k-raw");
  mark(field?.primary, "k-primary");
  if (field?.keepStyle) placeKept(container, el);
  else if (field?.context) container.appendChild(inContext(el));
  else container.appendChild(el);
  return true;
}

/** 사이트 버튼 여러 개를 한 줄에 (예: [목록] [글쓰기]). 하나도 없으면 null. cls3 은 그 버튼에 붙일 표시 (강조 모양 등) */
function buttonRow(cls: string, items: [Hit | null, Field | undefined, string?][]): HTMLElement | null {
  const row = h("div", `${cls} k-move`);
  for (const [hit_, field, mark] of items) {
    if (!hit_?.el) continue;
    if (mark) hit_.el.classList.add(mark);
    moveInto(row, hit_.el, field);
  }
  return row.childElementCount ? row : null;
}

/** 옮겨 담을 상자: 사이트 모양 그대로면 k-keep, 아니면 통합 화면 모양으로 맞추는 k-move */
const slotBox = (cls: string, field?: Field) => h("div", `${cls} ${field?.keepStyle ? "k-keep" : "k-move"}`);

function moveSlot(cls: string, h_: Hit | null, field?: Field): HTMLElement | null {
  if (!h_?.el) return null;
  const box = slotBox(cls, field);
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
  /** 사이트가 원본 쪽에 연 답글 쓰기 칸을 해당 댓글 아래로 옮기고, 사이트가 닫은 것은 지운다 */
  syncReplyForms(): void;
}

export function buildPost(l: LocatedPost, recipe: Recipe): PostView {
  const p = l.page;
  const f = l.fields;
  // 글 아래 게시글 목록: 다른 칸을 옮기기 전에 찾아 둔다
  const postRows = p.list ? locatePostList(p.list, recipe) : null;
  const root = h("div");

  const head = h("header", "k-head");
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

  // 제목 줄과 본문 사이 블록 (뮬 장터 글의 판매 정보 표 등)
  const info = moveSlot("k-info", f.info, p.info);
  if (info) root.appendChild(info);
  for (const box of [moveSlot("k-body", f.body, p.body), moveSlot("k-actions", f.actions, p.actions), moveSlot("k-ad", f.ad, p.ad)])
    if (box) root.appendChild(box);
  // 사이트의 원래 [목록]·[글쓰기] 버튼: 본문 아래, 댓글 위 한 줄 (사이트에 없으면 생략)
  const buttons = buttonRow("k-list", [
    [f.listLink, p.listLink],
    [f.write, p.write, "k-write"],
  ]);
  if (buttons) root.appendChild(buttons);

  // 베스트 댓글: 기능이 없는 사이트(bestItem 없음)거나 0개면 섹션 자체를 만들지 않음
  const bestSection = h("section", "k-best k-gen");
  const bestList = h("div", "k-cmt-list");
  bestSection.append(h("h2", "k-sec-title", "베스트 댓글"), bestList);

  const cmtSection = h("section", "k-comments k-gen");
  const cmtTitle = h("h2", "k-sec-title", "댓글");
  const cmtList = h("div", "k-cmt-list");
  cmtSection.append(cmtTitle, cmtList);

  // 글 아래 게시글 목록 (레시피 list): 댓글보다 아래, 원본 링크 위. 댓글 쪽 요소는 이 앞에 놓인다
  const postList = postRows ? h("section", "k-post-list") : null;
  if (postList) root.appendChild(postList);
  const src = h("a", "k-source", `원본 보기 · ${location.host}`);
  src.href = location.href;
  root.appendChild(src);
  const place = (el: Element) => root.insertBefore(el, postList ?? src); // 원본 링크는 항상 맨 아래

  // 사이트가 댓글 버튼 이벤트를 상위 요소에 위임해 둔 경우(jQuery .on(selector) 등), 버튼을 그 밖으로 꺼내면 동작하지 않는다.
  // 그래서 그 상위 요소(anchor)를 통째로 뼈대에 옮기고, 원래 내용은 숨긴 채 그 "안에" 통일된 댓글 목록을 만든다.
  let anchor: HTMLElement | null = null;
  const adoptAnchor = () => {
    if (!p.comments?.anchor) return;
    // 뼈대(root)는 다 만든 뒤에 문서에 붙이므로, 만드는 동안 root 안의 anchor 는 isConnected 가 false 다.
    // 그때 다시 찾으면(문서에는 이제 없음) 못 찾아 댓글 섹션·쓰기 칸이 anchor 밖으로 빠졌다 → root 안에 있으면 그대로 쓴다
    if (!anchor || (!anchor.isConnected && !root.contains(anchor))) {
      anchor = document.querySelector(p.comments.anchor) as HTMLElement | null;
      if (!anchor) return;
      anchor.classList.add("k-anchor");
      if (!root.contains(anchor)) place(anchor);
    }
    for (const child of Array.from(anchor.children))
      if (!child.classList.contains("k-gen")) child.classList.add("k-hidden");
    // 사이트 모양 그대로 옮긴 블록(keepStyle)의 껍데기(.k-ctx)는 원본 조상의 id 까지 본뜬다. 원본이 문서 앞쪽에 있으면 사이트가 id 로
    // 찾을 때 원본이 잡히지만, anchor 는 뼈대 안으로 옮겨져 그 앞의 껍데기보다 뒤에 온다. 그러면 사이트가 $("#bd_…") 로 껍데기를 잡아
    // 그 안에서 댓글 입력칸을 못 찾는다 (에펨코리아 댓글 쓰기 칸이 "로딩중..." 에 멈춤). anchor 밖 껍데기에서 anchor 쪽 id 는 뗀다
    const ids = new Set([anchor.id, ...Array.from(anchor.querySelectorAll("[id]"), (e) => e.id)].filter(Boolean));
    for (const c of Array.from(root.querySelectorAll<HTMLElement>(`.${CTX_CLASS}[id]`)))
      if (ids.has(c.id) && !anchor.contains(c)) c.removeAttribute("id");
  };

  const moreBox = h("div", "k-more k-move");
  cmtSection.appendChild(moreBox);
  // 댓글 쓰기 칸: 댓글 목록 바로 아래 (사이트의 입력칸·등록 버튼을 그대로 옮겨 사이트 동작대로)
  const writeBox = moveSlot("k-cmt-write", f.commentWrite, p.commentWrite);
  // 댓글 이벤트를 상위 요소에 위임한 사이트(anchor)면 쓰기 칸도 그 안(댓글 목록 아래)에 두므로, 숨기지 않을 엔진 영역으로 표시
  writeBox?.classList.add("k-gen");
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
    if (writeBox && writeBox.previousElementSibling !== cmtSection) {
      if (cmtSection.parentElement) cmtSection.after(writeBox);
      else place(writeBox);
    }
    if (bestList.childElementCount && bestSection.parentElement !== host) host.insertBefore(bestSection, p.comments ? cmtSection : null);
  };
  ensureSections();
  syncMore();

  const sources = new Map<HTMLElement, Element>(); // 뼈대 댓글 → 원본 item
  /** 옮긴 답글 쓰기 칸 → 원래 자리 표시 (사이트가 원래 자리를 지우면 = 칸을 닫으면 같이 지움) */
  const replyForms = new Map<HTMLElement, Comment>();

  const view: PostView = {
    kind: "post",
    root,
    addComment(c, best) {
      c.item.setAttribute("data-kong-done", "1");
      if (!c.content) return;
      const box = h("div", `k-cmt${c.isReply ? " k-reply" : ""}`);
      // 여러 단계 대댓글: 깊이만큼 더 들여쓴다 (CSS 변수 --k-depth)
      if (c.depth > 1) {
        box.style.setProperty("--k-depth", String(c.depth));
        box.dataset.depth = String(c.depth);
      }
      const top = h("div", "k-cmt-head");
      // 글쓴이: 사이트 표시 그대로(아이콘·IP)가 있으면 그것, 아니면 글자
      let who: HTMLElement = h("span", "k-who", c.who ?? "익명");
      if (c.whoNode) {
        who = h("span", "k-who k-move");
        moveInto(who, c.whoNode, p.comments?.whoNode);
      }
      top.append(who, h("span", "k-when", c.when));
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
    syncReplyForms() {
      const spec = p.comments?.replyWrite;
      if (!spec) return;
      // 사이트가 칸을 닫으면 지운다: 원래 자리 표시가 없어졌거나(디시), 옮긴 칸 자체를 사이트가 지운 경우(뮬은 Vue v-if 로 칸을 뺀다)
      for (const [box, mark] of replyForms)
        if (!mark.isConnected || !findAll(box, spec.sel).els.length) {
          box.remove();
          mark.remove();
          replyForms.delete(box);
        }
      for (const form of findAll(document, spec.sel).els) {
        // 이미 옮긴 것 (엔진 영역 안). #kong-root 안이라도 anchor 의 숨겨진 원본 댓글 안에 생긴 칸은 옮긴다 —
        // 에펨코리아는 댓글 영역(anchor)을 통째로 옮겨 두고, [댓글] 을 누르면 숨겨진 원본 댓글(li) 안에 답글 칸을 넣는다
        if (form.closest(".k-gen, .k-reply-write")) continue;
        if (form.closest(`#${ROOT_ID}`) && !form.closest(".k-anchor")) continue;
        // 원본에서 바로 앞에 있는 댓글 = 이 칸이 답글을 다는 댓글 (그 스레드 끝)
        let target: HTMLElement | null = null;
        let targetItem: Element | null = null;
        for (const [box, item] of sources)
          if (item.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING && (!targetItem || targetItem.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING)) {
            target = box;
            targetItem = item;
          }
        if (!target) continue;
        const mark = document.createComment("kong-reply-write");
        form.before(mark);
        const box = slotBox("k-reply-write", spec);
        moveInto(box, form, spec);
        target.after(box);
        replyForms.set(box, mark);
        box.querySelector<HTMLElement>("textarea")?.focus();
      }
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
  if (postList && !renderPostList(postList, postRows!)) postList.remove();

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

/**
 * 글 아래 게시글 목록: 목록 화면(list.from)의 행 스펙을 빌려(글 화면에서 다른 것만 덮어써) 찾는다.
 * 글 화면의 다른 칸을 옮기기 전에 불러야 한다 (에펨코리아는 댓글 영역(anchor)이 목록까지 감싸고 있어, 옮긴 뒤에는 문서에서 못 찾는다)
 */
function locatePostList(spec: PostList, recipe: Recipe): LocatedBoard | null {
  const from = recipe.pages.find((x): x is BoardPage => x.type === "board" && x.id === spec.from);
  if (!from) return null;
  const page: BoardPage = {
    ...from,
    rows: { ...from.rows, ...spec.rows },
    // 덮어쓴 칸은 셀렉터만 바꾸고 나머지 설정(keepStyle 등)은 목록 화면 것 그대로
    pager: spec.pager ? { ...from.pager, ...spec.pager } : from.pager,
    search: spec.search ? { ...from.search, ...spec.search } : from.search,
    more: undefined,
    write: undefined,
  };
  const lb = locateBoard(document, page);
  return lb.rows.length ? lb : null;
}

/** 찾아 둔 글 아래 목록을 목록 화면과 같은 행으로 그린다. 그릴 행이 없으면 false */
function renderPostList(box: HTMLElement, lb: LocatedBoard): boolean {
  const list = h("div", "k-rows");
  const add = rowAdder(lb, list);
  for (const r of lb.rows) add(r);
  if (!list.children.length) return false;
  box.append(h("h2", "k-sec-title", "글 목록"), list);
  for (const slot of [moveSlot("k-pager", lb.pager, lb.page.pager), moveSlot("k-search", lb.search, lb.page.search)]) if (slot) box.appendChild(slot);
  return true;
}

/** 목록 행 그리기 (목록 화면과 글 아래 목록이 같이 쓴다). 지금 보고 있는 글 행은 강조 */
function rowAdder(l: LocatedBoard, list: HTMLElement): (r: LocatedRow) => void {
  const rule = { params: l.page.rows.visitParams, pattern: l.page.rows.visitPattern };
  const here = visitKey(location.href, rule);
  return (r) => {
    r.item.setAttribute("data-kong-done", "1");
    if (!r.title || !r.href) return;
    const a = h("a", `k-row${r.notice ? " k-notice" : ""}`);
    a.href = r.href;
    // 지금 보고 있는 글 (글 아래 목록)
    if (here && visitKey(r.href, rule) === here) a.classList.add("k-row-here");
    // 읽은 글은 제목 색을 바꾼다 (사이트의 방문한 링크 색처럼)
    if (isVisited(r.href, rule)) a.classList.add("k-visited");
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
    const info = meta([r.author, r.createdAt, r.views && `조회 ${r.views}`, r.likes && r.likes !== "0" && `추천 ${r.likes}`]);
    // 제목 아래 한 줄 (에펨코리아 핫딜의 쇼핑몰·가격·배송 등)
    const extra = r.extra ? h("div", "k-row-extra", r.extra) : null;
    if (r.thumbnail) {
      // 썸네일: 행 왼쪽에 작은 그림, 제목·정보는 오른쪽 (못 불러오면 그림 자리를 없앤다)
      a.classList.add("k-has-thumb");
      const img = h("img", "k-thumb") as HTMLImageElement;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = r.thumbnail;
      img.addEventListener("error", () => {
        img.remove();
        a.classList.remove("k-has-thumb");
      });
      const body = h("div", "k-row-body");
      body.append(t, ...(extra ? [extra] : []), info);
      a.append(img, body);
    } else {
      // 썸네일이 없는 행: 갤러리 보기에서 빈 그림 자리 (목록 보기에서는 숨김)
      if (l.page.rows.gallery) a.appendChild(h("span", "k-thumb k-thumb-empty"));
      a.append(t, ...(extra ? [extra] : []), info);
    }
    list.appendChild(a);
  };
}

export function buildBoard(l: LocatedBoard, recipe: Recipe): BoardView {
  const root = h("div");

  const head = h("header", "k-head");
  head.append(h("h1", "k-title", l.boardName?.value ?? "게시판"));
  // 게시판 제목 오른쪽: 사이트의 [글쓰기] 버튼
  const tools = buttonRow("k-head-tools", [[l.write, l.page.write, "k-write"]]);
  if (tools) {
    head.classList.add("k-head-row");
    head.appendChild(tools);
  }
  root.appendChild(head);

  const list = h("div", "k-rows");
  // 목록 | 갤러리 전환 (레시피 rows.gallery): 같은 행을 썸네일 카드로. 고른 것은 사이트마다 기억
  if (l.page.rows.gallery) {
    const key = `kong-gallery:${location.host}`;
    let on = false;
    try {
      on = localStorage.getItem(key) === "1";
    } catch {
      /* 저장소를 못 쓰면 목록형 */
    }
    const sw = h("div", "k-view-switch");
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "보기 방식");
    const btns = (["목록", "갤러리"] as const).map((label, i) => {
      const b = h("button", "k-view-btn", label);
      b.type = "button";
      b.addEventListener("click", () => set(i === 1));
      return b;
    });
    const set = (g: boolean) => {
      on = g;
      list.classList.toggle("k-gallery", g);
      btns.forEach((b, i) => b.setAttribute("aria-pressed", String((i === 1) === g)));
      try {
        localStorage.setItem(key, g ? "1" : "0");
      } catch {
        /* 무시 */
      }
    };
    sw.append(...btns);
    set(on);
    head.classList.add("k-head-row");
    const t = head.querySelector(".k-head-tools");
    if (t) t.prepend(sw);
    else {
      const tools2 = h("div", "k-head-tools");
      tools2.appendChild(sw);
      head.appendChild(tools2);
    }
  }
  root.appendChild(list);

  const view: BoardView = { kind: "board", root, addRow: rowAdder(l, list) };
  for (const r of l.rows) view.addRow(r);

  for (const box of [
    moveSlot("k-more", l.more, l.page.more),
    moveSlot("k-pager", l.pager, l.page.pager),
    moveSlot("k-search", l.search, l.page.search),
  ])
    if (box) root.appendChild(box);
  // 왼쪽 메뉴 열과 함께 두 열로 감싼다 (메뉴가 없는 사이트면 한 열 그대로)
  view.root = buildShell(root, recipe, "board");
  return view;
}

// ---------- 첫 화면 (게시판에 들어가기 전) ----------

/** 제목 + 광고만. 원본 내용(뉴스·추천글 등)은 숨겨진 채로 둔다 */
/** 큰 로고를 사이트 스크립트가 나중에 그리는 경우(네이버 두들·N 로고): 잠깐 다시 보다가 더 앞 후보가 생기면 다시 그린다 */
export const HERO_WAIT = 5000;
function watchHero(p: LocatedHub["page"], recipe: Recipe, first: Hit | null, onBetter: (el: HTMLElement) => void) {
  const sels = p.hero?.sel ?? [];
  const drawn = (x: Hit | null) => !!x?.el && (x.el.matches("img, svg") || !!x.el.querySelector("img, svg"));
  const rank = (x: Hit | null) => (drawn(x) && x!.sel ? sels.indexOf(x!.sel) : Infinity);
  let best = rank(first);
  if (!sels.length || best === 0) return;
  const t0 = Date.now();
  const tick = () => {
    const x = hit(document, p.hero);
    const r = rank(x);
    if (r < best) {
      best = r;
      onBetter(heroMark(x!.el, recipe));
    }
    if (best > 0 && Date.now() - t0 < HERO_WAIT) setTimeout(tick, 150);
  };
  setTimeout(tick, 150);
}

export function buildHub(l: LocatedHub, recipe: Recipe): HTMLElement {
  const root = h("div");
  const p = l.page;
  if (p.layout === "landing") {
    // 구글 첫 화면처럼: 큰 로고 + 검색창만 (설계 8-14절). 검색창은 사이트 모양 그대로 두므로 첫 화면 검색칸(k-hub-top)의 통일 규칙을 받지 않게 다른 이름으로
    let hero = heroMark(l.hero?.el ?? null, recipe);
    root.appendChild(hero);
    watchHero(p, recipe, l.hero, (next) => {
      hero.replaceWith(next);
      hero = next;
    });
    const search = moveSlot("k-landing-search", l.top, p.top);
    if (search) root.appendChild(search);
    // 검색창 아래: 사이트 블록(네이버 바로가기 아이콘 줄) → 광고(사본이면 mirror)
    for (const el of l.blocks) {
      const box = slotBox("k-landing-block", p.blocks);
      moveInto(box, el, p.blocks);
      root.appendChild(box);
    }
    if (p.ads?.mirror) {
      const box = h("div", "k-ad k-landing-ad k-keep");
      mirrorInto(box, p.ads);
      root.appendChild(box);
    } else
      for (const el of l.ads) {
        const box = slotBox("k-ad k-landing-ad", p.ads);
        moveInto(box, el, p.ads);
        root.appendChild(box);
      }
    return buildShell(root, recipe, "hub", "landing");
  }
  if (p.title) {
    const head = h("header", "k-head");
    head.append(h("h1", "k-title", l.title?.value ?? recipe.siteName));
    root.appendChild(head);
  }
  const top = moveSlot("k-hub-top", l.top, p.top);
  if (top) root.appendChild(top);
  for (const [els, field, cls] of [
    [l.blocks, p.blocks, "k-hub-block"],
    [l.ads, p.ads, "k-ad"],
  ] as const) {
    for (const el of els) {
      const box = slotBox(cls, field);
      moveInto(box, el, field);
      root.appendChild(box);
    }
  }
  return buildShell(root, recipe, "hub");
}

// ---------- 화면에 붙이기 ----------

/**
 * 폰에서 PC 페이지를 받으면 사이트가 정한 넓은 화면 폭(루리웹 width=1159, 디시는 없음 = 980)으로 그려진다.
 * 통합 화면은 폭에 맞게 바뀌므로 기기 폭으로 그리게 한다 (PC 브라우저는 viewport 를 무시하므로 영향 없음)
 */
function fitViewport() {
  const content = "width=device-width, initial-scale=1";
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    (document.head ?? document.documentElement).appendChild(meta);
  }
  meta.content = content;
}

/** 레시피 fit 을 CSS 규칙으로 (통합 화면 안에서만, 나중에 붙는 요소에도) */
export function fitCss(fit: FitSpec | undefined): string {
  const scope = (sels: string[]) => sels.map((s) => `#${ROOT_ID} ${s}`).join(",");
  let out = "";
  if (fit?.row?.length) {
    const rows = scope(fit.row);
    // 칸이 모자라면 다음 줄로 (사이트가 나중에 끼워 넣는 것, 예: 디시 댓글 쓰기의 사람 확인 상자)
    out += `:is(${rows}){display:flex!important;flex-wrap:wrap;align-items:flex-start;gap:8px}`;
    out += `:is(${rows})>*{float:none!important;flex:none}`;
  }
  // fill 은 row 안에서는 남은 폭을 차지하는 칸(기준 폭 0 이라 긴 글이어도 줄이 넘어가지 않음), row 밖에서는 옆 float 옆에 나란히 서는 칸.
  // (overflow: hidden 대신 flow-root: 사이트가 나중에 끼워 넣는 층·상자가 잘리지 않게)
  if (fit?.fill?.length) out += `:is(${scope(fit.fill)}){float:none!important;width:auto!important;flex:1 1 0!important;min-width:0;display:flow-root!important}`;
  if (fit?.tight?.length) out += `:is(${scope(fit.tight)}){padding-left:16px!important;padding-right:16px!important}`;
  if (fit?.static?.length) out += `:is(${scope(fit.static)}){position:static!important}`;
  for (const r of fit?.right ?? []) out += `:is(${scope([r.sel])}){left:auto!important;right:${r.px ?? 0}px!important}`;
  // full 은 폭만: 부모 폭에 맞추고 넓은 화면 기준의 최소 폭·좌우 여백(가운데 맞춤용)을 푼다.
  // float 는 그대로 두어야 앞의 float 줄 아래로 내려간다 (디시 글쓰기의 제목칸)
  if (fit?.full?.length) out += `:is(${scope(fit.full)}){width:100%!important;max-width:100%!important;min-width:0!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}`;
  return out;
}

export function mount(root: HTMLElement, hide: string[] = [], fit?: FitSpec, overlays: string[] = []) {
  const style = h("style");
  style.id = "kong-style";
  // hide·fit 은 나중에 붙는 요소(떠다니는 배너, 펼칠 때 불러오는 댓글 등)에도 적용되도록 CSS 규칙으로 건다
  style.textContent = css + hide.map((s) => `${s}{display:none!important}`).join("") + fitCss(fit);
  (document.head ?? document.documentElement).appendChild(style);
  document.documentElement.classList.add("kong-on");
  fitViewport();

  // 지금 있는 원본 화면만 숨긴다. 이후 사이트가 body 에 붙이는 팝업(이미지 뷰어, 알림 등)은 그대로 보이게
  // (k-orig 는 body 바로 아래에 있을 때만 숨긴다: 사이트가 나중에 그 요소를 다른 곳으로 옮겨 보여 주면 보이게.
  //  예) 디시 디시콘 층 #div_con 은 처음엔 body 바로 아래, 누르면 에디터 도구줄로 옮겨져 열린다)
  for (const child of Array.from(document.body.children)) child.classList.add("k-orig");
  document.body.appendChild(root);
  // 사이트 팝업(레시피 overlays)은 숨기지 않고 body 바로 아래로 (원본 화면 안에 미리 들어 있던 로그인 창·사진 확대 등)
  for (const sel of overlays)
    for (const el of findAll(document, [sel]).els) {
      if (root.contains(el)) continue;
      el.classList.remove("k-orig");
      if (el.parentElement !== document.body) document.body.appendChild(el);
    }
  // 사이트가 숨겨 둔 원본 요소를 body 밖으로 옮기면 표시를 뗀다 (나중에 다시 body 에 붙여 보여 줘도 숨지 않게:
  // 디시는 디시콘 층을 body 로 돌려놨다가 다시 꺼내 쓴다). 숨기는 대상은 재배치 때의 원본 화면뿐
  new MutationObserver((records) => {
    for (const r of records) for (const n of Array.from(r.removedNodes)) if (n instanceof Element && n.parentElement !== document.body) n.classList.remove("k-orig");
  }).observe(document.body, { childList: true });
}

export function isDone(item: Element) {
  return item.getAttribute("data-kong-done") === "1";
}
