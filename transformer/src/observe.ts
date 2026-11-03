// ⑤ 감시: 늦게 붙는 댓글, "더보기"로 추가되는 목록 행, 댓글 페이지 교체를 뼈대에 반영한다.
import type { BoardView, PostView } from "./layout.js";
import { isDone } from "./layout.js";
import { findAll, locateComment, locateRows } from "./locate.js";
import { refreshNav } from "./nav.js";
import type { BoardPage, PostPage } from "./recipe.js";

function onChange(fn: () => void) {
  let pending = false;
  const obs = new MutationObserver((records) => {
    // 엔진이 만든 목록/메뉴 안에서 일어난 변화(우리가 옮기거나 그린 것)는 무시
    if (records.every((r) => (r.target as Element).closest?.(".k-gen, .k-rows, .k-nav, .k-side"))) return;
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      fn();
      refreshNav(); // 사이트가 메뉴를 늦게 채우는 경우 (디시 최근 방문 등)
    }, 150);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  return obs;
}

// anchor 를 쓰면 원본 댓글 item 도 #kong-root 안(숨겨진 영역)에 있으므로, 엔진이 만든 목록(.k-gen) 안인지로 거른다
const fresh = (els: Element[]) => els.filter((item) => !isDone(item) && !item.closest(".k-gen"));

/** onBatch: 감시로 댓글을 반영할 때마다 호출 (늦게 붙는 댓글의 검산용) */
export function observePost(page: PostPage, view: PostView, onBatch?: () => void) {
  const spec = page.comments;
  if (!spec) return;
  onChange(() => {
    view.ensure();
    view.prune();
    if (spec.bestItem)
      for (const item of fresh(findAll(document, spec.bestItem).els)) view.addComment(locateComment(item, spec), true);
    for (const item of fresh(findAll(document, spec.item).els)) view.addComment(locateComment(item, spec), false);
    view.refreshCount();
    onBatch?.();
  });
}

export function observeBoard(page: BoardPage, view: BoardView) {
  onChange(() => {
    const scope = findAll(document, page.rows.scope).els[0];
    if (!scope) return;
    for (const r of locateRows(scope, page.rows)) if (!isDone(r.item)) view.addRow(r);
  });
}
