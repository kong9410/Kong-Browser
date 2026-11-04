// 링크에 마우스를 올리면 페이지 왼쪽 아래에 그 주소 (Chrome 의 상태 표시줄)
// - 페이지 안에 Shadow DOM 으로 그리고 pointer-events: none 이라 클릭을 막지 않는다
// - 마우스가 왼쪽 아래 구석에 있으면 가리지 않게 오른쪽으로 옮긴다

const HOST_ID = "kong-link-status";
let box: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let mouse = { x: 0, y: 0 };

/** 보일 주소: 한글 등은 풀어서, 너무 길면 가운데를 줄임 */
export function displayLink(url: string, max = 120): string {
  let s = url;
  try {
    s = decodeURI(url);
  } catch {
    /* 잘못 인코딩된 주소는 그대로 */
  }
  s = s.replace(/^https:\/\//, ""); // Chrome 처럼 https:// 는 생략 (http:// 는 그대로 보여 안전하지 않은 주소를 알 수 있게)
  return s.length > max ? s.slice(0, Math.ceil(max * 0.6)) + "…" + s.slice(s.length - Math.floor(max * 0.4) + 1) : s;
}

const STYLE = `
  :host { all: initial; }
  .s {
    position: fixed; left: 0; bottom: 0; z-index: 2147483646;
    max-width: min(640px, 60vw);
    padding: 4px 10px;
    background: #ffffff; color: #3a3a3c;
    border: 1px solid #dcdcdf; border-bottom: 0; border-left: 0;
    border-radius: 0 8px 0 0;
    font: 12px/1.5 "Pretendard", "Segoe UI", "Malgun Gothic", system-ui, sans-serif;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.06);
    pointer-events: none;
    opacity: 0; transition: opacity 0.12s;
  }
  .s.on { opacity: 1; }
  .s.right { left: auto; right: 0; border-left: 1px solid #dcdcdf; border-right: 0; border-radius: 8px 0 0 0; }
`;

function ensure(): HTMLDivElement | null {
  if (box?.isConnected) return box;
  if (!document.documentElement) return null;
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${STYLE}</style><div class="s"></div>`;
  box = root.querySelector<HTMLDivElement>(".s");
  document.documentElement.appendChild(host);
  addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }), { passive: true });
  return box;
}

export function showLinkStatus(url: string) {
  clearTimeout(hideTimer);
  if (!url) {
    // 링크 사이를 옮겨 다닐 때 깜빡이지 않게 조금 늦게 숨긴다
    hideTimer = setTimeout(() => box?.classList.remove("on"), 120);
    return;
  }
  const b = ensure();
  if (!b) return;
  b.textContent = displayLink(url);
  // 마우스가 왼쪽 아래(상태 표시 자리)에 있으면 오른쪽으로
  const nearLeftBottom = mouse.y > innerHeight - 60 && mouse.x < Math.min(660, innerWidth * 0.62);
  b.classList.toggle("right", nearLeftBottom);
  b.classList.add("on");
}
