// 방문 기록 페이지: 날짜별 목록, 검색, 하나씩 삭제, 모두 삭제
import type { HistoryEntry } from "../shared";
import { el, hostOf, internal, siteIcon } from "./pages";

const list = document.getElementById("list")!;
const empty = document.getElementById("empty")!;
const q = document.getElementById("q") as HTMLInputElement;
const clear = document.getElementById("clear") as HTMLButtonElement;

function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "오늘";
  if (d.toDateString() === yesterday.toDateString()) return "어제";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
const timeOf = (t: number) => new Date(t).toTimeString().slice(0, 5);

function render(items: HistoryEntry[]) {
  list.replaceChildren();
  empty.hidden = items.length > 0;
  let day = "";
  let box: HTMLElement | null = null;
  for (const h of items) {
    const label = dayLabel(h.at);
    if (label !== day) {
      day = label;
      list.appendChild(el("h2", "day", label));
      box = el("div", "card");
      list.appendChild(box);
    }
    const row = el("div", "row");
    row.dataset.id = h.id;
    const a = el("a", "title");
    a.href = h.url;
    a.title = h.url;
    a.append(siteIcon(h.url), el("span", "text", h.title || h.url));
    const del = el("button", "del", "×");
    del.title = "이 기록 삭제";
    del.onclick = async () => {
      await internal.removeVisit(h.id);
      row.remove();
    };
    row.append(el("span", "time", timeOf(h.at)), a, el("span", "host", hostOf(h.url)), del);
    box!.appendChild(row);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  render(await internal.history(q.value, 1000));
}
q.oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(load, 200);
};

// 실수로 지우지 않도록 두 번 눌러야 삭제 (창이 뜨는 확인 대화상자 대신)
let armed = false;
clear.onclick = async () => {
  if (!armed) {
    armed = true;
    clear.textContent = "한 번 더 누르면 모두 삭제";
    setTimeout(() => {
      armed = false;
      clear.textContent = "기록 모두 삭제";
    }, 3000);
    return;
  }
  await internal.clearHistory();
  armed = false;
  clear.textContent = "기록 모두 삭제";
  load();
};

load();
