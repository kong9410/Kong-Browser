// 다운로드 내역 페이지 (Ctrl+J): 날짜별 목록, 검색, 열기·폴더에서 보기·일시 중지·취소·다시 받기, 목록에서 지우기
import { isActive, ratio, statusText, type DownloadInfo } from "../downloads";
import type { DownloadAction } from "../shared";
import { el, hostOf, internal } from "./pages";

type Entry = DownloadInfo & { exists: boolean };

const list = document.getElementById("list")!;
const empty = document.getElementById("empty")!;
const q = document.getElementById("q") as HTMLInputElement;
const clear = document.getElementById("clear") as HTMLButtonElement;
const folder = document.getElementById("folder") as HTMLButtonElement;

function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "오늘";
  if (d.toDateString() === yesterday.toDateString()) return "어제";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
const timeOf = (t: number) => new Date(t).toTimeString().slice(0, 5);

const act = (d: Entry, action: DownloadAction) => async () => {
  await internal.downloadAction(d.id, action);
  load();
};

function button(label: string, onclick: () => void) {
  const b = el("button", "plain small", label);
  b.type = "button";
  b.onclick = onclick;
  return b;
}

function row(d: Entry): HTMLElement {
  const r = el("div", "row dl-row");
  r.dataset.id = String(d.id);
  const gone = d.state === "completed" && !d.exists;

  // 파일 이름: 다 받았고 파일이 있으면 눌러서 열기
  const name = el(d.state === "completed" && !gone ? "button" : "span", "dl-name", d.name);
  name.title = d.path;
  if (name instanceof HTMLButtonElement) name.onclick = act(d, "open");
  if (gone || d.state === "cancelled" || d.state === "interrupted") name.classList.add("dim");

  const info = el("div", "dl-info");
  const meta = el("div", "dl-meta");
  meta.append(el("span", d.state === "interrupted" ? "dl-status fail" : "dl-status", gone ? "삭제된 파일" : statusText(d)), el("span", "host", hostOf(d.url)));
  info.append(name, meta);
  // 받는 중: 진행 막대 (크기를 모르면 흐르는 막대)
  if (isActive(d)) {
    const bar = el("div", "dl-bar");
    const fill = el("div", "dl-fill");
    const p = ratio(d);
    if (p === null) bar.classList.add("indeterminate");
    else fill.style.width = `${Math.round(p * 100)}%`;
    bar.appendChild(fill);
    info.appendChild(bar);
  }

  const actions = el("div", "dl-actions");
  if (d.state === "completed" && !gone) actions.append(button("폴더에서 보기", act(d, "show")));
  else if (d.state === "progressing") actions.append(button("일시 중지", act(d, "pause")), button("취소", act(d, "cancel")));
  else if (d.state === "paused") actions.append(button("계속", act(d, "resume")), button("취소", act(d, "cancel")));
  else actions.append(button("다시 받기", act(d, "retry")));

  const del = el("button", "del", "×");
  del.title = isActive(d) ? "취소하고 목록에서 지우기" : "목록에서 지우기 (파일은 그대로)";
  del.onclick = act(d, "remove");

  r.append(el("span", "time", timeOf(d.startedAt)), info, actions, del);
  return r;
}

function render(items: Entry[]) {
  list.replaceChildren();
  empty.hidden = items.length > 0;
  let day = "";
  let box: HTMLElement | null = null;
  for (const d of items) {
    const label = dayLabel(d.startedAt);
    if (label !== day) {
      day = label;
      list.appendChild(el("h2", "day", label));
      box = el("div", "card");
      list.appendChild(box);
    }
    box!.appendChild(row(d));
  }
}

// 받는 중인 것이 있으면 1초마다 다시 읽어 진행을 갱신
let poll: ReturnType<typeof setTimeout> | undefined;
async function load() {
  clearTimeout(poll);
  const items = (await internal.downloads(q.value)) ?? [];
  render(items);
  if (items.some(isActive)) poll = setTimeout(load, 1000);
}

let typing: ReturnType<typeof setTimeout> | undefined;
q.oninput = () => {
  clearTimeout(typing);
  typing = setTimeout(load, 200);
};
folder.onclick = () => internal.openDownloadsFolder();

// 실수로 지우지 않도록 두 번 눌러야 지움 (방문 기록 페이지와 같은 방식)
let armed = false;
clear.onclick = async () => {
  if (!armed) {
    armed = true;
    clear.textContent = "한 번 더 누르면 모두 지움";
    setTimeout(() => {
      armed = false;
      clear.textContent = "목록 모두 지우기";
    }, 3000);
    return;
  }
  await internal.clearDownloads();
  armed = false;
  clear.textContent = "목록 모두 지우기";
  load();
};

// 다른 탭에서 받은 것도 보이도록 이 탭으로 돌아오면 다시 읽기
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load();
});

load();
