// 북마크 관리 페이지: 폴더 만들기·이름 바꾸기·삭제, 북마크 이름 바꾸기·폴더 옮기기·삭제
import type { Bookmark, BookmarkData } from "../shared";
import { el, hostOf, internal, siteIcon } from "./pages";

const groups = document.getElementById("groups")!;
const form = document.getElementById("new-folder") as HTMLFormElement;
const nameInput = document.getElementById("folder-name") as HTMLInputElement;

form.onsubmit = async (e) => {
  e.preventDefault();
  if (!nameInput.value.trim()) return;
  await internal.addFolder(nameInput.value);
  nameInput.value = "";
  load();
};

/** 글자 자리를 입력칸으로 바꿔 이름을 고친다 (Enter 저장, Esc 취소) */
function editInPlace(target: HTMLElement, value: string, save: (v: string) => Promise<void>) {
  const input = el("input", "edit");
  input.value = value;
  target.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (ok: boolean) => {
    if (done) return;
    done = true;
    if (ok && input.value.trim() && input.value.trim() !== value) await save(input.value);
    load();
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  };
  input.onblur = () => finish(true);
}

function bookmarkRow(b: Bookmark, data: BookmarkData): HTMLElement {
  const row = el("div", "row");
  const a = el("a", "title");
  a.href = b.url;
  a.title = b.url;
  const text = el("span", "text", b.title);
  a.append(siteIcon(b.url, b.favicon), text);

  // 폴더 옮기기
  const select = el("select");
  select.title = "폴더로 이동";
  for (const [value, label] of [["", "북마크 바"], ...data.folders.map((f) => [f.id, f.name])]) {
    const o = el("option", undefined, label);
    o.value = value;
    o.selected = (b.folder ?? "") === value;
    select.appendChild(o);
  }
  select.onchange = async () => {
    await internal.moveBookmark(b.url, select.value || null);
    load();
  };

  const rename = el("button", "btn small", "이름 바꾸기");
  rename.onclick = () => editInPlace(text, b.title, (v) => internal.renameBookmark(b.url, v));
  const del = el("button", "del", "×");
  del.title = "북마크 삭제";
  del.onclick = async () => {
    await internal.removeBookmark(b.url);
    load();
  };
  row.append(a, el("span", "host", hostOf(b.url)), select, rename, del);
  return row;
}

function group(title: string, list: Bookmark[], data: BookmarkData, folderId: string | null) {
  const head = el("div", "group-head");
  const h2 = el("h2");
  const name = el("span", undefined, title);
  h2.append(name, el("span", "count", `${list.length}`));
  head.appendChild(h2);
  if (folderId) {
    const rename = el("button", "btn small", "이름 바꾸기");
    rename.onclick = () => editInPlace(name, title, (v) => internal.renameFolder(folderId, v));
    // 폴더를 지우면 안의 북마크는 북마크 바로 나온다 (지워지지 않음)
    const del = el("button", "btn small", "폴더 삭제");
    del.title = "폴더만 지우고, 안의 북마크는 북마크 바로 옮깁니다";
    del.onclick = async () => {
      await internal.removeFolder(folderId);
      load();
    };
    head.append(rename, del);
  }
  const card = el("div", "card");
  if (list.length) list.forEach((b) => card.appendChild(bookmarkRow(b, data)));
  else card.appendChild(el("div", "empty-row", folderId ? "비어 있는 폴더입니다. 북마크의 폴더 선택에서 옮겨 넣으세요." : "북마크 바에 바로 놓인 북마크가 없습니다."));
  groups.append(head, card);
}

async function load() {
  const data = await internal.bookmarks();
  groups.replaceChildren();
  if (!data) return;
  group("북마크 바", data.bookmarks.filter((b) => !b.folder), data, null);
  for (const f of data.folders) group(f.name, data.bookmarks.filter((b) => b.folder === f.id), data, f.id);
}

load();
