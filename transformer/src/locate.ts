// ① 탐지: 레시피대로 요소를 찾기만 한다. 여기서는 DOM 을 절대 바꾸지 않는다.
import type { BoardPage, CommentSpec, Field, HubPage, Page, PostPage, Recipe, RowSpec } from "./recipe.js";

export interface Hit {
  el: Element | null;
  value: string | null;
  /** 매칭된 셀렉터 (진단용) */
  sel: string | null;
  /** 그 셀렉터가 찾은 요소 수 (title/body 처럼 하나여야 하는 필드의 검산용) */
  count: number;
}

export interface LocatedComment {
  item: Element;
  who: string | null;
  when: string | null;
  content: Element | null;
  actions: Element | null;
  isReply: boolean;
}

export interface LocatedPost {
  page: PostPage;
  fields: Record<"category" | "title" | "author" | "createdAt" | "views" | "likes" | "body" | "actions" | "ad" | "listLink" | "commentCount", Hit | null>;
  best: LocatedComment[];
  comments: LocatedComment[];
  more: Hit | null;
}

export interface LocatedRow {
  item: Element;
  title: string | null;
  href: string | null;
  category: string | null;
  author: string | null;
  createdAt: string | null;
  views: string | null;
  likes: string | null;
  commentCount: string | null;
  notice: boolean;
  image: boolean;
  video: boolean;
}

export interface LocatedBoard {
  page: BoardPage;
  boardName: Hit | null;
  scope: Element | null;
  rows: LocatedRow[];
  pager: Hit | null;
  more: Hit | null;
}

export interface LocatedHub {
  page: HubPage;
  title: Hit | null;
  /** 옮길 광고 요소들 (문서 순서) */
  ads: Element[];
}

export type Located = LocatedPost | LocatedBoard | LocatedHub;

const EMPTY: Hit = { el: null, value: null, sel: null, count: 0 };

/** 잘못된 셀렉터 하나 때문에 전체가 죽지 않도록 감싼다 */
function qsa(scope: ParentNode, sel: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll(sel));
  } catch {
    return [];
  }
}

export function findAll(scope: ParentNode, sels: string[]): { els: Element[]; sel: string | null } {
  for (const sel of sels) {
    const els = qsa(scope, sel);
    if (els.length) return { els, sel };
  }
  return { els: [], sel: null };
}

export function cleanText(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function readValue(el: Element, field: Field): string | null {
  let source = el;
  if (!field.attr && field.exclude?.length) {
    // 텍스트에서 빼야 할 부분(제목 옆 댓글 수 등)은 복제본에서 지우고 읽는다. 원본은 그대로
    source = el.cloneNode(true) as Element;
    for (const sel of field.exclude) qsa(source, sel).forEach((e) => e.remove());
  }
  let raw = field.attr ? el.getAttribute(field.attr) : source.textContent;
  raw = cleanText(raw);
  if (field.pattern && raw) {
    const m = raw.match(new RegExp(field.pattern));
    raw = m ? cleanText(m[1] ?? m[0]) : "";
  }
  return raw || null;
}

export function hit(scope: ParentNode, field: Field | undefined): Hit | null {
  if (!field) return null;
  // text 가 있으면 셀렉터마다 글자 조건까지 맞는 요소를 찾는다
  const textRe = field.text ? new RegExp(field.text) : null;
  for (const sel of field.sel) {
    const els = qsa(scope, sel).filter((e) => !textRe || textRe.test(cleanText(e.textContent)));
    if (els.length) return { el: els[0], value: readValue(els[0], field), sel, count: els.length };
  }
  return { ...EMPTY };
}

const val = (scope: ParentNode, field: Field | undefined) => hit(scope, field)?.value ?? null;

/** URL 에 맞는 page 를 고른다. match 는 맞는데 probe 가 전부 실패하면 구조가 바뀐 것 */
export function pickPage(recipe: Recipe, doc: Document): { page: Page | null; candidates: Page[] } {
  const path = doc.location.pathname + doc.location.search;
  const candidates = recipe.pages.filter((p) => {
    try {
      return new RegExp(p.match).test(path);
    } catch {
      return false;
    }
  });
  const page = candidates.find((p) => p.probe.every((sel) => qsa(doc, sel).length > 0)) ?? null;
  return { page, candidates };
}

export function locateComment(item: Element, spec: CommentSpec): LocatedComment {
  return {
    item,
    who: val(item, spec.who),
    when: val(item, spec.when),
    content: hit(item, spec.content)?.el ?? null,
    actions: hit(item, spec.actions)?.el ?? null,
    isReply: spec.replyMarker ? item.matches(spec.replyMarker) || qsa(item, spec.replyMarker).length > 0 : false,
  };
}

function locateComments(doc: Document, spec: CommentSpec, items: string[]): LocatedComment[] {
  return findAll(doc, items).els.map((item) => locateComment(item, spec));
}

export function locatePost(doc: Document, page: PostPage): LocatedPost {
  const c = page.comments;
  return {
    page,
    fields: {
      category: hit(doc, page.category),
      title: hit(doc, page.title),
      author: hit(doc, page.author),
      createdAt: hit(doc, page.createdAt),
      views: hit(doc, page.views),
      likes: hit(doc, page.likes),
      body: hit(doc, page.body),
      actions: hit(doc, page.actions),
      ad: hit(doc, page.ad),
      listLink: hit(doc, page.listLink),
      commentCount: hit(doc, page.commentCount),
    },
    best: c?.bestItem ? locateComments(doc, c, c.bestItem) : [],
    comments: c ? locateComments(doc, c, c.item) : [],
    more: c ? hit(doc, c.more) : null,
  };
}

/** 행 자신이나 그 안에 표시(sel)가 있는지 */
function marked(item: Element, sel: string | undefined): boolean {
  if (!sel) return false;
  try {
    return item.matches(sel) || qsa(item, sel).length > 0;
  } catch {
    return false;
  }
}

export function locateRows(scope: Element, spec: RowSpec): LocatedRow[] {
  return findAll(scope, spec.item).els.map((item) => ({
    item,
    title: val(item, spec.title),
    href: (() => {
      const h = hit(item, { attr: "href", ...spec.link });
      return h?.value ? new URL(h.value, location.href).toString() : null;
    })(),
    category: val(item, spec.category),
    author: val(item, spec.author),
    createdAt: val(item, spec.createdAt),
    views: val(item, spec.views),
    likes: val(item, spec.likes),
    commentCount: val(item, spec.commentCount),
    notice: marked(item, spec.notice),
    image: marked(item, spec.image),
    video: marked(item, spec.video),
  }));
}

export function locateBoard(doc: Document, page: BoardPage): LocatedBoard {
  const scope = findAll(doc, page.rows.scope).els[0] ?? null;
  return {
    page,
    boardName: hit(doc, page.boardName),
    scope,
    rows: scope ? locateRows(scope, page.rows) : [],
    pager: hit(doc, page.pager),
    more: hit(doc, page.more),
  };
}

export function locateHub(doc: Document, page: HubPage): LocatedHub {
  return {
    page,
    title: hit(doc, page.title),
    ads: page.ads ? findAll(doc, page.ads.sel).els : [],
  };
}

export function locate(doc: Document, page: Page): Located {
  if (page.type === "post") return locatePost(doc, page);
  if (page.type === "hub") return locateHub(doc, page);
  return locateBoard(doc, page);
}
