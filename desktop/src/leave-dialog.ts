// 페이지 나가기 확인 창 (글쓰기 화면처럼 사이트가 beforeunload 로 떠나기를 막을 때)
// - Electron 은 확인 창 없이 이동을 그냥 취소한다. main 이 will-prevent-unload 를 받아 이 창을 띄우라고 알린다
// - 운영체제 기본 창 대신 앱 모양으로 직접 그린다 (Shadow DOM 으로 사이트 CSS 와 격리, <html> 에 붙임)
// - 나가기: 사이트의 beforeunload 를 끄고 막혔던 이동(방금 누른 링크, 또는 main 이 기억한 주소창·뒤로 등)을 다시 한다

const HOST_ID = "kong-leave-dialog";
/** 막힌 이동이 이만큼 안에 시작된 것이면 '방금 하려던 이동' 으로 본다 */
export const FRESH_MS = 1500;

let allowLeave = false;
let lastLink: { href: string; at: number } | null = null;

export const isFresh = (at: number | undefined, now: number) => at !== undefined && now - at >= 0 && now - at <= FRESH_MS;

/** 같은 탭에서 이 링크로 이동하는 보통 클릭인가 (새 탭·다운로드·스크립트 링크 제외) */
export function sameTabLink(href: string, target: string, e: { button: number; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean; altKey: boolean }) {
  if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return false;
  if (target && !/^_(self|top|parent)$/i.test(target)) return false;
  return /^https?:/i.test(href);
}

/** 문서 시작 때 한 번: 우리 beforeunload(capture) 를 사이트 것보다 먼저 걸고, 방금 누른 링크를 기억 */
export function installLeaveGuard() {
  addEventListener(
    "beforeunload",
    (e) => {
      if (allowLeave) e.stopImmediatePropagation();
    },
    true,
  );
  // 버블 단계 끝(window)에서: 사이트가 막은(preventDefault) 클릭은 이동이 아니므로 빼고
  addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    const a = e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement && !!n.href);
    if (a && sameTabLink(a.href, a.target, e)) lastLink = { href: a.href, at: Date.now() };
  });
}

const STYLE = `
  :host { all: initial; }
  .dim {
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    background: rgba(17, 17, 26, 0.32);
    backdrop-filter: blur(2px);
    font: 14px/1.5 "Pretendard", "Segoe UI", "Malgun Gothic", system-ui, sans-serif;
    color: #1d1d1f;
    animation: fade 0.14s ease-out;
  }
  .card {
    width: min(360px, calc(100vw - 32px));
    padding: 24px 24px 18px;
    background: #ffffff; border-radius: 16px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06);
    animation: pop 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .icon {
    width: 40px; height: 40px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: #eef2ff; color: #4f46e5; margin-bottom: 14px;
  }
  .icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  h2 { margin: 0 0 6px; font-size: 17px; font-weight: 700; letter-spacing: -0.2px; }
  p { margin: 0; color: #6e6e73; font-size: 13.5px; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  button {
    min-width: 84px; height: 38px; padding: 0 16px;
    border-radius: 10px; border: 0; cursor: pointer;
    font: inherit; font-weight: 600;
    transition: background 0.12s, transform 0.08s;
  }
  button:active { transform: scale(0.97); }
  button:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 2px; }
  .stay { background: #f1f3f4; color: #1d1d1f; }
  .stay:hover { background: #e6e8ea; }
  .leave { background: #4f46e5; color: #ffffff; }
  .leave:hover { background: #4338ca; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(0.97); } }
`;

/**
 * 확인 창을 띄운다. go: 나가기를 골랐을 때 main 에 '막혔던 이동을 다시 해 달라' 고 묻는다 (해 줬으면 true).
 * main 도 모르는 이동이면 방금 누른 링크로 가고, 그것도 없으면 다음 이동부터는 막지 않는다
 */
export function askLeave(go: () => Promise<boolean>) {
  if (document.getElementById(HOST_ID) || !document.documentElement) return;
  const link = lastLink && isFresh(lastLink.at, Date.now()) ? lastLink.href : null;
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="dim">
      <div class="card" role="alertdialog" aria-modal="true" aria-labelledby="t" aria-describedby="d">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg></div>
        <h2 id="t">이 페이지를 나가시겠어요?</h2>
        <p id="d">작성 중인 내용은 저장되지 않을 수 있어요.</p>
        <div class="buttons">
          <button class="stay">취소</button>
          <button class="leave">나가기</button>
        </div>
      </div>
    </div>`;
  const prevFocus = document.activeElement as HTMLElement | null;
  const close = () => {
    host.remove();
    removeEventListener("keydown", onKey, true);
  };
  const stay = () => {
    close();
    prevFocus?.focus?.();
  };
  const leave = async () => {
    close();
    allowLeave = true;
    if (link) return void location.assign(link);
    await go().catch(() => false);
  };
  // 창이 떠 있는 동안 키 입력은 사이트로 보내지 않는다 (Esc 취소, Enter 는 포커스된 버튼)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") stay();
    else if (e.key === "Tab") {
      const btns = [...root.querySelectorAll("button")];
      const i = btns.indexOf(root.activeElement as HTMLButtonElement);
      btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length].focus();
      e.preventDefault();
    } else if (e.key === "Enter") (root.activeElement as HTMLButtonElement | null)?.click();
    else return;
    e.stopPropagation();
    e.preventDefault();
  };
  root.querySelector<HTMLButtonElement>(".stay")!.onclick = stay;
  root.querySelector<HTMLButtonElement>(".leave")!.onclick = leave;
  root.querySelector(".dim")!.addEventListener("mousedown", (e) => e.target === e.currentTarget && stay());
  addEventListener("keydown", onKey, true);
  document.documentElement.appendChild(host);
  root.querySelector<HTMLButtonElement>(".leave")!.focus();
}
