// 페이지에서 찾기 막대 (Ctrl+F): 입력하면 바로 찾고, Enter 다음 / Shift+Enter 이전 / Esc 닫기
import type { OverlayIn, OverlayOut } from "../shared";

declare global {
  interface Window {
    kongOverlay: { on: (fn: (m: OverlayIn) => void) => void; send: (m: OverlayOut) => void };
  }
}

const ov = window.kongOverlay;
const q = document.getElementById("q") as HTMLInputElement;
const count = document.getElementById("count")!;
const prev = document.getElementById("prev") as HTMLButtonElement;
const next = document.getElementById("next") as HTMLButtonElement;

const find = (forward: boolean, again: boolean) => ov.send({ type: "find", text: q.value, forward, next: again });

function showCount(active: number, total: number) {
  const empty = !q.value;
  count.textContent = empty ? "" : `${active}/${total}`;
  count.classList.toggle("none", !empty && total === 0);
  prev.disabled = next.disabled = total === 0;
}

q.oninput = () => {
  if (!q.value) showCount(0, 0);
  find(true, false);
};
q.onkeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (q.value) find(!e.shiftKey, true);
  } else if (e.key === "Escape") {
    e.preventDefault();
    ov.send({ type: "findClose" });
  }
};
prev.onclick = () => find(false, true);
next.onclick = () => find(true, true);
document.getElementById("close")!.onclick = () => ov.send({ type: "findClose" });

ov.on((m) => {
  if (m.type === "findOpen") {
    // 다시 열면 지난 검색어를 선택한 채로 (바로 고쳐 쓰거나 Enter 로 이어 찾기)
    if (m.text && !q.value) q.value = m.text;
    q.focus();
    q.select();
    if (q.value) find(true, false);
    else showCount(0, 0);
  } else if (m.type === "findResult") showCount(m.active, m.total);
});
