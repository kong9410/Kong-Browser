// ② 판정: ok / degraded / broken. broken 이면 DOM 을 건드리지 않고 원본을 보여준다.
// 설계: docs/DESIGN.md 7-1절
import type { Hit, Located, LocatedBoard, LocatedPost } from "./locate.js";
import type { Field, Recipe } from "./recipe.js";

export interface Judgement {
  verdict: "ok" | "degraded" | "broken";
  failed: string[];
  warnings: string[];
}

function checkFields(
  entries: [string, Field | undefined, Hit | null][],
  failed: string[],
  warnings: string[],
) {
  for (const [name, field, h] of entries) {
    if (!field) continue; // 레시피에 없는 필드 = 사이트에 없는 정보
    // 필수 필드는 값까지 있어야 하고, 선택 필드는 요소만 있으면 된다
    // (말머리가 없는 글처럼 자리는 있는데 비어 있는 건 정상)
    const needsValue = field.required && !["body", "actions", "ad", "listLink"].includes(name);
    const found = needsValue ? !!h?.value : !!h?.el;
    if (!found) (field.required ? failed : warnings).push(name);
  }
}

function judgePost(l: LocatedPost, recipe: Recipe, failed: string[], warnings: string[]) {
  const p = l.page;
  const f = l.fields;
  checkFields(
    [
      ["category", p.category, f.category],
      ["title", p.title, f.title],
      ["author", p.author, f.author],
      ["createdAt", p.createdAt, f.createdAt],
      ["views", p.views, f.views],
      ["likes", p.likes, f.likes],
      ["body", p.body, f.body],
      ["actions", p.actions, f.actions],
      ["listLink", p.listLink, f.listLink],
      // 광고(ad)는 노출될 때도 안 될 때도 있으므로 판정에 넣지 않는다
      ["commentCount", p.commentCount, f.commentCount],
    ],
    failed,
    warnings,
  );

  // 조용한 고장 검산
  const title = f.title?.value ?? "";
  if (title && (title.length > 300 || title === recipe.siteName)) failed.push("title:suspicious");
  if ((f.title?.count ?? 0) > 1) warnings.push("title:multiple");
  if ((f.body?.count ?? 0) > 1) warnings.push("body:multiple");
  const body = f.body?.el;
  if (body && !body.textContent?.trim() && !body.querySelector("img, video, iframe")) failed.push("body:empty");

  // 댓글을 나중에 AJAX 로 불러오는 사이트는 아직 0개일 수 있다 → 검산은 댓글이 붙은 뒤 checkCommentCount 로
  if (p.comments && !(p.comments.lazy && l.comments.length === 0)) {
    const missing = l.comments.filter((c) => !c.content).length;
    if (missing) warnings.push(`comments.content:missing(${missing})`);
    const w = checkCommentCount(l.comments.length, f.commentCount?.value, !!l.more?.el);
    if (w) warnings.push(w);
  }
}

/** 화면에 표시된 댓글 수와 찾은 댓글 수 비교. 문제가 있으면 경고 문자열 */
export function checkCommentCount(found: number, expectedText: string | null | undefined, paged: boolean): string | null {
  const expected = Number(expectedText?.replace(/[^0-9]/g, ""));
  if (!expectedText || !Number.isFinite(expected)) return null;
  const diff = Math.abs(expected - found);
  // 댓글 페이지가 나뉘는 사이트는 화면의 댓글 수가 더 적을 수 있으므로 "더 많이" 찾은 경우만 엄격히 본다
  if (found > expected + 2 || (diff > Math.max(3, expected * 0.2) && !paged)) return `comments:count(${found}/${expected})`;
  return null;
}

function judgeBoard(l: LocatedBoard, recipe: Recipe, failed: string[], warnings: string[]) {
  if (!l.scope) {
    failed.push("rows.scope");
    return;
  }
  const valid = l.rows.filter((r) => r.title && r.href);
  if (valid.length < 3) failed.push(`rows:few(${valid.length})`);
  if (l.page.boardName && !l.boardName?.value) warnings.push("boardName");

  // 행 링크가 같은 사이트의 게시글 주소인지: 사이드바/다른 게시판 목록이 섞였는지 잡는다
  const postMatches = recipe.pages.filter((p) => p.type === "post").map((p) => new RegExp(p.match));
  if (postMatches.length && valid.length) {
    const ok = valid.filter((r) => {
      const u = new URL(r.href!);
      return u.host === location.host && postMatches.some((re) => re.test(u.pathname + u.search));
    }).length;
    if (ok / valid.length < 0.8) failed.push(`rows:links(${ok}/${valid.length})`);
  }
  // 링크가 없는 행은 글이 아니라 광고 등이므로 건너뛰고, "링크는 있는데 제목을 못 찾은" 행만 경고
  // 같은 게시판의 글인지: 올바른 목록이면 사실상 전부 같아야 하므로 기준을 높게 둔다
  const sb = l.page.rows.sameBoard;
  if (sb && valid.length) {
    const re = new RegExp(sb);
    const key = (u: string) => {
      const x = new URL(u);
      return (x.pathname + x.search).match(re)?.[1] ?? null;
    };
    const here = key(location.href);
    const same = valid.filter((r) => key(r.href!) === here).length;
    if (!here || same / valid.length < 0.95) failed.push(`rows:otherBoards(${valid.length - same}/${valid.length})`);
  }
  const noTitle =l.rows.filter((r) => r.href && !r.title).length;
  if (noTitle) warnings.push(`rows:incomplete(${noTitle})`);
}

export function judge(l: Located, recipe: Recipe): Judgement {
  const failed: string[] = [];
  const warnings: string[] = [];
  if (l.page.type === "post") judgePost(l as LocatedPost, recipe, failed, warnings);
  else judgeBoard(l as LocatedBoard, recipe, failed, warnings);
  return { verdict: failed.length ? "broken" : warnings.length ? "degraded" : "ok", failed, warnings };
}
