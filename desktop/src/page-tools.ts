// 모든 페이지에 붙는 브라우저 기능: 우하단 맨 위/맨 아래 버튼 (설계 8-2절)
// - 통일 화면, 원본, 레시피 없는 사이트 모두에서 동작
// - 필요할 때만 보임: 맨 위면 ↑ 숨김, 맨 아래면 ↓ 숨김, 스크롤할 내용이 없으면 둘 다 숨김
// - 사이트 요소를 옮기는 게 아니라 우리가 만든 요소이므로 Shadow DOM 으로 사이트 CSS 와 완전히 격리한다
// - <body> 가 아니라 <html> 에 붙인다: 엔진이 재배치할 때 body 의 기존 자식을 숨기므로 그 영향을 받지 않게

const HOST_ID = "kong-scroll-buttons";
const EDGE = 80; // 위/아래 끝에서 이 거리 안이면 "끝에 있다"로 본다

const STYLE = `
  :host { all: initial; }
  .wrap {
    position: fixed; right: 20px; bottom: 24px; z-index: 2147483647;
    display: flex; flex-direction: column; gap: 8px;
  }
  button {
    width: 42px; height: 42px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid #dcdcdf; background: #ffffff; color: #1d1d1f;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    cursor: pointer; padding: 0;
    transition: opacity 0.15s, transform 0.15s;
  }
  button:hover { border-color: #4f46e5; color: #4f46e5; transform: translateY(-1px); }
  button[hidden] { display: none; }
  svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
`;

export function installScrollButtons() {
  const install = () => {
    if (document.getElementById(HOST_ID) || !document.documentElement) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="wrap">
        <button class="up" title="맨 위로" aria-label="맨 위로" hidden><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="down" title="맨 아래로" aria-label="맨 아래로" hidden><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
      </div>`;
    const up = root.querySelector<HTMLButtonElement>(".up")!;
    const down = root.querySelector<HTMLButtonElement>(".down")!;
    const scroller = () => document.scrollingElement ?? document.documentElement;

    up.onclick = () => scroller().scrollTo({ top: 0, behavior: "smooth" });
    down.onclick = () => scroller().scrollTo({ top: scroller().scrollHeight, behavior: "smooth" });

    let queued = false;
    const update = () => {
      queued = false;
      const s = scroller();
      const max = s.scrollHeight - window.innerHeight;
      const scrollable = max > EDGE;
      up.hidden = !(scrollable && s.scrollTop > EDGE);
      down.hidden = !(scrollable && s.scrollTop < max - EDGE);
    };
    const schedule = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    // 댓글이 늦게 붙거나 재배치로 페이지 길이가 바뀌는 경우
    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    document.documentElement.appendChild(host);
    update();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

/**
 * 사이트가 막아 둔 오른쪽 클릭·글 선택·복사를 푼다 (디시는 글 속 이미지의 오른쪽 클릭을 막음).
 * 페이지 스크립트보다 먼저(document-start) window 의 캡처 단계에서 이벤트가 사이트 처리기로 가지 않게 한다.
 * 기본 동작(브라우저 메뉴, 선택, 복사)은 그대로. 레시피가 있는 커뮤니티 사이트에서만 쓴다 (다른 사이트의 자체 메뉴는 존중)
 */
export function allowCopy() {
  for (const type of ["contextmenu", "selectstart", "copy"]) window.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
}
