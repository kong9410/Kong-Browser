// 보이는 사본 (Field.mirror). 옮길 수 없는 요소를 복사해 통합 화면에 보인다.
// - React 가 그리는 칸: 떼어 가면 사이트가 다시 그릴 때 오류가 날 수 있다
// - 스크립트가 내용을 써 넣은 iframe(src 없음): 옮기면 빈 화면으로 다시 열린다 → 그 문서를 srcdoc 사본으로.
//   사본은 sandbox 로 스크립트를 막는다(광고 노출 집계가 두 번 되지 않게). 링크는 새 창으로 (사용자가 누를 때만)
import { findAll } from "./locate.js";
import type { Field } from "./recipe.js";

/** 사본 iframe 에 줄 권한: 스크립트 없음, 누르면 새 창 */
export const MIRROR_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/** 스크립트가 쓴 iframe 의 문서 (같은 출처일 때만). 아직 비었으면 null */
function frameHtml(f: HTMLIFrameElement): string | null {
  try {
    const doc = f.contentDocument;
    if (!doc?.body || !doc.body.innerHTML.trim()) return null;
    const html = doc.documentElement.outerHTML;
    // 상대 주소가 원래 페이지 기준이 되게, 링크는 새 창으로
    const base = `<base href="${(doc.baseURI || location.href).replace(/"/g, "&quot;")}" target="_blank">`;
    return "<!doctype html>" + (/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html);
  } catch {
    return null; // 다른 출처: 읽을 수 없음
  }
}

/** el 의 사본. 스크립트가 쓴 iframe 이 아직 비어 있으면 null (나중에 다시) */
export function mirrorCopy(el: Element): Element | null {
  const orig = Array.from(el.querySelectorAll("iframe"));
  // 아직 빈 칸(광고 스크립트가 iframe 을 넣기 전): 나중에 다시
  if (!orig.length && !el.querySelector("img, video, svg") && !el.textContent?.trim()) return null;
  const copy = el.cloneNode(true) as Element;
  const dup = Array.from(copy.querySelectorAll("iframe"));
  for (let i = 0; i < orig.length; i++) {
    const d = dup[i];
    d.setAttribute("sandbox", MIRROR_SANDBOX);
    if (orig[i].getAttribute("src")) {
      // 주소로 여는 iframe 은 사본이 다시 불러와 집계가 두 번 될 수 있어 비워 둔다
      d.removeAttribute("src");
      continue;
    }
    const html = frameHtml(orig[i]);
    if (html === null) return null;
    d.setAttribute("srcdoc", html);
    // 원본은 숨겨져 있어 광고 스크립트가 높이를 0 으로 잴 수 있다 → iframe 이나 가장 가까운 조상에 적힌 높이(px)를 쓴다
    const px = (e: Element) => {
      const v = (e as HTMLElement).style?.height;
      return v && /^[0-9.]+px$/.test(v) && parseFloat(v) > 0 ? v : null;
    };
    let h: string | null = null;
    for (let e: Element | null = orig[i]; e && !h; e = e === el ? null : e.parentElement) h = px(e);
    if (h) d.style.height = h;
  }
  for (const e of [copy, ...Array.from(copy.querySelectorAll("[id]"))]) e.removeAttribute("id");
  copy.classList.add("k-mirror");
  return copy;
}

/** 사본을 기다리는 최대 시간 (사이트가 광고를 늦게 그리는 경우) */
export const MIRROR_WAIT = 8000;

/** 원본이 바뀌었는지 볼 표시: 요소 자신 + 스크립트가 쓴 iframe 문서 (광고 스크립트는 내용을 쓴 뒤 iframe 높이를 바꾼다) */
function signature(el: Element): string {
  let s = el.outerHTML;
  for (const f of Array.from(el.querySelectorAll("iframe")))
    try {
      s += "|" + (f.contentDocument?.body?.innerHTML.length ?? 0);
    } catch {
      /* 다른 출처 */
    }
  return s;
}

/**
 * box 에 field 로 찾은 요소의 사본을 넣는다. 아직 없거나 비었으면 잠깐씩 다시 보고(그동안 box 는 숨김),
 * 그린 뒤에도 MIRROR_WAIT 동안은 원본이 바뀌면 다시 그린다
 */
export function mirrorInto(box: HTMLElement, field: Field) {
  box.hidden = true;
  const t0 = Date.now();
  let last = "";
  const tick = () => {
    const el = findAll(document, field.sel).els.find((e) => !e.closest(".k-mirror, #kong-root"));
    const sig = el ? signature(el) : "";
    if (el && sig !== last) {
      const copy = mirrorCopy(el);
      if (copy) {
        last = sig;
        box.replaceChildren(copy);
        box.hidden = false;
      }
    }
    if (Date.now() - t0 < MIRROR_WAIT) setTimeout(tick, 200);
  };
  tick();
}
