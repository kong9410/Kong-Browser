// 주소창 자동완성 목록: 첫 줄은 입력한 그대로(이동/검색), 그 아래 북마크(★)와 방문 기록
import type { Suggestion } from "../suggest";

declare global {
  interface Window {
    kongSuggest: {
      onList(fn: (list: Suggestion[], selected: number) => void): void;
      choose(url: string): void;
    };
  }
}

const ICONS: Record<Suggestion["kind"], string> = {
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  go: `<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  history: `<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4M12 7.5V12l3 2"/></svg>`,
};

/** 보여줄 주소: 스킴과 끝의 / 를 뗀다 */
const shortUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");

const box = document.getElementById("list")!;

window.kongSuggest.onList((list, selected) => {
  box.replaceChildren(
    ...list.map((s, i) => {
      const row = document.createElement("div");
      row.className = `row ${s.kind}${i === selected ? " sel" : ""}`;
      const ico = document.createElement("span");
      ico.className = "ico";
      ico.innerHTML = ICONS[s.kind];
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = s.title;
      row.append(ico, title);
      if (s.kind === "bookmark" || s.kind === "history") {
        const url = document.createElement("span");
        url.className = "url";
        url.textContent = `— ${shortUrl(s.url)}`;
        row.appendChild(url);
      }
      if (s.folder) {
        const f = document.createElement("span");
        f.className = "folder";
        f.textContent = s.folder;
        row.appendChild(f);
      }
      // mousedown: 주소창이 포커스를 잃어 목록이 닫히기 전에 고른다
      row.onmousedown = (e) => {
        e.preventDefault();
        window.kongSuggest.choose(s.url);
      };
      return row;
    }),
  );
});
