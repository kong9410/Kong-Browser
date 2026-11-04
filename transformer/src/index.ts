// 엔진 진입점. 앱/개발 도구는 document-start 에 이 번들을 넣고 kong.boot(레시피들) 만 호출하면 된다.
import { hideNow, reveal } from "./hide.js";
import { checkCommentCount, judge } from "./judge.js";
import { buildBoard, buildHub, buildPost, mount, type PostView } from "./layout.js";
import { setVisited } from "./visited.js";
import { findAll, hit, locate, pickPage, type Located, type LocatedBoard, type LocatedHub, type LocatedPost } from "./locate.js";
import { extractMenu } from "./menu.js";
import { revealCurrent, setNavOptions } from "./nav.js";
import { observeBoard, observePost, observeHub } from "./observe.js";
import { ENGINE_VERSION, type Recipe, type Status } from "./recipe.js";

declare global {
  interface Window {
    /** Android 앱이 @JavascriptInterface 로 주입하는 브리지 (없으면 무시) */
    /** 왼쪽 메뉴를 접거나 펼치면 알림 (앱이 다음에도 같은 상태로 열도록 기억) */
    KongBridge?: { onStatus(json: string): void; onNav?(open: boolean): void };
    kong?: typeof api;
    __kongStatus?: Status;
  }
}

/** 재배치 도중 예외가 나면 이 표시를 남기고 새로고침 → 다음 로드는 원본 그대로 */
const OFF_KEY = "kong-off:";

function report(status: Status) {
  window.__kongStatus = status;
  console.info("[kong] " + JSON.stringify(status));
  try {
    window.KongBridge?.onStatus(JSON.stringify(status));
  } catch {
    /* 브리지 오류가 페이지에 영향 주지 않게 */
  }
}

function status(recipe: Recipe | null, partial: Partial<Status>, t0: number): Status {
  return {
    verdict: "none",
    host: location.host,
    recipeVersion: recipe?.version ?? null,
    pageId: null,
    failed: [],
    warnings: [],
    engine: ENGINE_VERSION,
    ms: Math.round(performance.now() - t0),
    ...partial,
  };
}

export function run(recipe: Recipe): Status {
  const t0 = performance.now();
  const done = (s: Partial<Status>) => {
    reveal();
    const st = status(recipe, s, t0);
    report(st);
    return st;
  };

  if (recipe.minEngine > ENGINE_VERSION) return done({ verdict: "broken", failed: ["engine"] });

  const { page, candidates } = pickPage(recipe, document);
  if (!page) {
    // URL 은 맞는데 표식이 없음 = 사이트 구조가 바뀜
    return candidates.length
      ? done({ verdict: "broken", pageId: candidates[0].id, failed: ["probe"] })
      : done({ verdict: "none" });
  }

  let located: Located;
  try {
    located = locate(document, page);
  } catch (e) {
    return done({ verdict: "broken", pageId: page.id, failed: [`exception:${String(e)}`] });
  }
  const j = judge(located, recipe);
  if (j.verdict === "broken") return done({ verdict: "broken", pageId: page.id, failed: j.failed });

  // 댓글을 늦게 불러오는 사이트에서 재배치 시점에 댓글이 0개였다면, 댓글이 처음 붙었을 때 검산한다
  let lateView: PostView | null = null;
  let lateCheck: (() => void) | undefined;
  // 재배치 전에 포커스가 있던 입력칸(네이버 검색창 등): 옮기면 포커스가 풀리므로 붙인 뒤 다시 준다
  const focused = document.activeElement;
  try {
    if (located.page.type === "post") {
      const post = located as LocatedPost;
      const view = buildPost(post, recipe);
      mount(view.root, page.hide, post.page.fit, recipe.overlays);
      revealCurrent();
      if (post.page.comments?.lazy && post.comments.length === 0) lateView = view;
      observePost(post.page, view, () => lateCheck?.());
    } else if (located.page.type === "hub") {
      mount(buildHub(located as LocatedHub, recipe), page.hide, (located as LocatedHub).page.fit, recipe.overlays);
      revealCurrent();
      observeHub();
    } else {
      const view = buildBoard(located as LocatedBoard, recipe);
      mount(view.root, page.hide, undefined, recipe.overlays);
      revealCurrent();
      observeBoard(located.page, view);
    }
  } catch (e) {
    // 이미 일부 노드를 옮겼을 수 있으므로, 원본으로 다시 로드한다
    const st = done({ verdict: "broken", pageId: page.id, failed: [`exception:${String(e)}`] });
    try {
      sessionStorage.setItem(OFF_KEY + location.href, "1");
      location.reload();
    } catch {
      /* sessionStorage 를 못 쓰면 그대로 둔다 */
    }
    return st;
  }
  if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected && focused.closest("#kong-root") && document.activeElement !== focused)
    focused.focus({ preventScroll: true });
  const st = done({ verdict: j.verdict, pageId: page.id, warnings: j.warnings });
  if (lateView && page.type === "post") {
    const v = lateView;
    const spec = page;
    lateCheck = () => {
      if (!lateCheck || v.commentTotal() === 0) return;
      lateCheck = undefined; // 한 번만
      const paged = !!spec.comments?.more && findAll(document, spec.comments.more.sel).els.length > 0;
      const w = checkCommentCount(v.commentTotal(), hit(document, spec.commentCount)?.value, paged);
      if (w)
        report({ ...st, verdict: st.verdict === "ok" ? "degraded" : st.verdict, warnings: [...st.warnings, w], ms: Math.round(performance.now() - t0) });
    };
  }
  return st;
}

/** 최대 기다림: 원본을 가려 두는 안전장치(hide.ts, 2.5초)보다 짧게 */
export const WAIT_MAX = 2400;

/**
 * 브라우저에서 그리는 사이트(레시피 waitFor): 주소는 맞는데 probe 가 아직 없으면 잠깐씩 다시 보고, 생기면(또는 시간이 다 되면) 재배치.
 * waitFor 가 없으면 바로 run
 */
export function runWhenDrawn(recipe: Recipe, onDone?: (s: Status) => void) {
  const limit = Math.min(Math.max(recipe.waitFor ?? 0, 0), WAIT_MAX);
  const t0 = performance.now();
  const tick = () => {
    const { page, candidates } = pickPage(recipe, document);
    if (page || !candidates.length || performance.now() - t0 >= limit) return onDone ? onDone(run(recipe)) : void run(recipe);
    setTimeout(tick, 100);
  };
  tick();
}

/** document-start 에서 호출. 맞는 레시피가 있으면 즉시 가리고, DOM 이 준비되면 재배치 */
export interface BootOptions {
  /** 왼쪽 메뉴를 펼친 채로 시작할지 (앱이 기억한 값). 기본 true */
  navOpen?: boolean;
  /** 이 사이트의 방문 기록 주소들 (목록에서 읽은 글 표시) */
  visited?: string[];
}

export function boot(recipes: Recipe | Recipe[], opts: BootOptions = {}) {
  setVisited(opts.visited ?? []);
  setNavOptions({
    open: opts.navOpen ?? true,
    onToggle: (open) => {
      try {
        window.KongBridge?.onNav?.(open);
      } catch {
        /* 무시 */
      }
    },
  });
  if (window.top !== window) return; // iframe(광고, 동영상) 안에서는 동작하지 않음
  const recipe = (Array.isArray(recipes) ? recipes : [recipes]).find((r) => r.host === location.host);
  if (!recipe) return;

  try {
    if (sessionStorage.getItem(OFF_KEY + location.href)) {
      sessionStorage.removeItem(OFF_KEY + location.href);
      return;
    }
  } catch {
    /* 무시 */
  }

  const path = location.pathname + location.search;
  const mayMatch = recipe.pages.some((p) => {
    try {
      return new RegExp(p.match).test(path);
    } catch {
      return false;
    }
  });
  if (!mayMatch) return;

  hideNow();
  // 사이트는 보통 DOM 준비 직후(jQuery ready 등)에 "셀렉터로" 버튼 이벤트를 붙인다.
  // 그보다 먼저 요소를 옮기면 사이트의 셀렉터가 못 찾아 이벤트가 안 붙으므로, 사이트 초기화가 끝난 뒤 실행한다.
  // (jQuery 3 의 ready 콜백은 DOMContentLoaded 뒤 setTimeout 으로 실행되므로, 매크로태스크 두 번을 양보한다)
  const later = () => setTimeout(() => setTimeout(() => runWhenDrawn(recipe), 0), 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", later, { once: true });
  else later();
}

/** 진단용: DOM 을 바꾸지 않고 레시피가 무엇을 찾았는지 보고한다 (kong diagnose 가 사용) */
export function inspect(recipe: Recipe) {
  const { page, candidates } = pickPage(recipe, document);
  const probes = candidates.map((p) => ({
    page: p.id,
    probes: p.probe.map((sel) => ({ sel, found: document.querySelectorAll(sel).length })),
  }));
  if (!page) return { page: null, candidates: candidates.map((p) => p.id), probes };
  const l = locate(document, page);
  const short = (s: string | null | undefined) => (s && s.length > 60 ? s.slice(0, 60) + "…" : (s ?? null));
  let detail: object;
  if (l.page.type === "post") {
    const p = l as LocatedPost;
    detail = {
      fields: Object.entries(p.fields)
        .filter(([, h]) => h)
        .map(([name, h]) => ({
          name,
          sel: h!.sel,
          count: h!.count,
          value: short(h!.value ?? (h!.el ? `<${h!.el.tagName.toLowerCase()}>` : null)),
        })),
      best: p.best.length,
      comments: p.comments.length,
      replies: p.comments.filter((c) => c.isReply).length,
      sampleComment: short(p.comments[0]?.content?.textContent?.trim()),
    };
  } else if (l.page.type === "hub") {
    const hb = l as LocatedHub;
    detail = { title: hb.title?.value ?? null, ads: hb.ads.map((e) => (e.id ? "#" + e.id : e.tagName.toLowerCase())) };
  } else {
    const b = l as LocatedBoard;
    detail = {
      boardName: b.boardName?.value ?? null,
      rows: b.rows.length,
      notices: b.rows.filter((r) => r.notice).length,
      /** 공지를 뺀 글 링크 전부 (스냅샷/카나리가 최신 글을 고를 때 사용) */
      hrefs: b.rows.filter((r) => r.href && !r.notice).map((r) => r.href!),
      sampleRows: b.rows.slice(0, 3).map((r) => ({
        title: short(r.title),
        href: r.href,
        meta: [r.category, r.author, r.createdAt, r.views, r.likes, r.commentCount],
      })),
    };
  }
  return { page: page.id, type: page.type, probes, ...detail, judgement: judge(l, recipe) };
}

const api = { version: ENGINE_VERSION, boot, run, inspect, menu: extractMenu };
window.kong = api;
