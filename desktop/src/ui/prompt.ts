// 사이트 권한 묻기 (알림·위치·카메라·마이크 등): 허용 / 차단 은 그 사이트에 기억, 닫기(×·Esc)는 이번만 차단
import type { OverlayIn, OverlayOut } from "../shared";

declare global {
  interface Window {
    kongOverlay: { on: (fn: (m: OverlayIn) => void) => void; send: (m: OverlayOut) => void };
  }
}

const ov = window.kongOverlay;
const site = document.getElementById("site")!;
const what = document.getElementById("what")!;
const more = document.getElementById("more")!;
const answer = (allow: boolean | null) => ov.send({ type: "answer", allow });

document.getElementById("allow")!.onclick = () => answer(true);
document.getElementById("block")!.onclick = () => answer(false);
document.getElementById("close")!.onclick = () => answer(null);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") answer(null);
});

ov.on((m) => {
  if (m.type !== "prompt") return;
  site.textContent = m.site;
  what.replaceChildren("이 사이트에서 ", Object.assign(document.createElement("b"), { textContent: m.label }), " 권한을 요청해요.");
  more.hidden = m.more === 0;
  more.textContent = `요청이 ${m.more}개 더 있어요.`;
});
