// 시작 페이지(새 탭): 북마크와 최근 방문을 보여준다
import { el, hostOf, internal, siteIcon } from "./pages";

async function showBookmarks() {
  const list = await internal.bookmarks();
  const box = document.getElementById("bookmarks")!;
  document.getElementById("bookmarks-section")!.hidden = !list?.length;
  box.replaceChildren(
    ...(list ?? []).map((b) => {
      const a = el("a", "tile");
      a.href = b.url;
      a.title = b.url;
      const title = el("b");
      title.append(siteIcon(b.url, b.favicon), document.createTextNode(b.title));
      const del = el("button", "del", "×");
      del.title = "북마크 삭제";
      del.onclick = async (e) => {
        e.preventDefault();
        await internal.removeBookmark(b.url);
        showBookmarks();
      };
      a.append(title, el("span", "sub", hostOf(b.url)), del);
      return a;
    }),
  );
}

async function showRecent() {
  // 방문 기록에는 같은 페이지가 여러 번 있으므로, 시작 페이지에서는 주소마다 한 번만 (최근 8개)
  const seen = new Set<string>();
  const list = ((await internal.history("", 100)) ?? []).filter((h) => !seen.has(h.url) && seen.add(h.url)).slice(0, 8);
  const box = document.getElementById("recent")!;
  document.getElementById("recent-section")!.hidden = !list?.length;
  box.replaceChildren(
    ...(list ?? []).map((h) => {
      const row = el("div", "row");
      const a = el("a", "title");
      a.href = h.url;
      a.title = h.url;
      a.append(siteIcon(h.url), el("span", "text", h.title || h.url));
      row.append(a, el("span", "host", hostOf(h.url)));
      return row;
    }),
  );
}

showBookmarks();
showRecent();
