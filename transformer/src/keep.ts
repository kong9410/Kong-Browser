// 사이트 모양 그대로 옮기기 (Field.keepStyle). 디시 홈의 실북갤·흥한갤처럼 사이트 CSS 를 살려야 하는 블록용.
// - 사이트 CSS 가 조상 클래스에 기대는 경우가 많으므로(.right_content .content_box …) 원래 조상(태그·id·class)을 본뜬
//   껍데기로 감싼다. 껍데기는 display: contents 라 자리를 차지하지 않고 선택자만 맞게 해 준다.
// - 통합 화면의 글꼴·색 강제(.k-move)를 적용하지 않고, 사이트 본문의 글꼴을 이어받게 한다.
// 껍데기는 Field.context 에도 쓴다: 사이트 스크립트가 클릭한 요소의 조상에서 값을 읽는 경우
// (디시 댓글을 누르면 $(this).parents('div.cmt_info').attr('data-no') 로 댓글 번호를 찾아 답글 칸을 연다)

/** 껍데기 표시 (style.css 에서 display: contents) */
export const CTX_CLASS = "k-ctx";

/**
 * el 의 원래 조상들을 본뜬 껍데기로 감싼 가장 바깥 요소. el 을 옮기기 전에 불러야 한다.
 * 조상의 속성(id·class·data-* 등)을 옮겨 적는다. style 과 on… (인라인 처리기)은 빼서 껍데기가 동작이나 모양을 갖지 않게.
 * (id 가 겹치지만 원본이 문서 앞쪽에 있어 사이트가 id 로 찾으면 원본이 잡힌다)
 */
export function inContext(el: Element): Element {
  let wrapped: Element = el;
  for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const w = document.createElement(a.tagName.toLowerCase());
    for (const at of Array.from(a.attributes)) if (at.name !== "style" && !at.name.startsWith("on") && !at.name.startsWith("data-kong")) w.setAttribute(at.name, at.value);
    // 엔진이 붙인 표시(원본을 숨기는 k-hidden 등)는 옮겨 적지 않는다
    for (const c of Array.from(w.classList)) if (c.startsWith("k-")) w.classList.remove(c);
    w.classList.add(CTX_CLASS);
    w.appendChild(wrapped);
    wrapped = w;
  }
  return wrapped;
}

/** 사이트 본문의 글꼴·색 (재배치 전에 읽어 둔다: 통합 화면의 글꼴 대신 이어받게) */
const INHERIT = ["fontFamily", "fontSize", "lineHeight", "color", "letterSpacing"] as const;

/** container 에 el 을 사이트 모양 그대로 넣는다 */
export function placeKept(container: HTMLElement, el: Element) {
  const bs = getComputedStyle(document.body);
  for (const k of INHERIT) if (bs[k]) container.style[k] = bs[k];
  // 옮긴 블록 자신은 원래 자리 기준의 위치 지정(position: absolute 등)을 풀어 상자 안에 놓이게 (style.css)
  el.setAttribute("data-kong-kept", "");
  container.appendChild(inContext(el));
}
