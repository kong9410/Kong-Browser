import { describe, expect, it } from "vitest";
import { bareUrl, looksLikeUrl, suggest, toUrl } from "./suggest";

const NOW = Date.UTC(2026, 10, 4, 12);
const DAY = 24 * 60 * 60 * 1000;
const visit = (url: string, title: string, daysAgo = 0) => ({ url, title, at: NOW - daysAgo * DAY });

describe("toUrl / looksLikeUrl", () => {
  it("스킴이 있으면 그대로", () => expect(toUrl("http://a.com/x")).toBe("http://a.com/x"));
  it("점이 들어간 이름은 https 주소로", () => {
    expect(toUrl("ruliweb.com")).toBe("https://ruliweb.com");
    expect(toUrl("gall.dcinside.com/board/lists?id=a")).toBe("https://gall.dcinside.com/board/lists?id=a");
  });
  it("localhost 는 주소", () => expect(looksLikeUrl("localhost:3000")).toBe(true));
  it("공백이 있거나 점이 없으면 검색", () => {
    expect(toUrl("루리웹 유머")).toBe("https://www.google.com/search?q=" + encodeURIComponent("루리웹 유머"));
    expect(looksLikeUrl("hello")).toBe(false);
  });
  it("비교용 주소는 스킴·www·끝 / 를 뗀다", () => expect(bareUrl("https://www.Ruliweb.com/")).toBe("ruliweb.com"));
});

describe("suggest", () => {
  const src = {
    bookmarks: [{ url: "https://bbs.ruliweb.com/community/board/300143", title: "유머 게시판", folder: "커뮤니티" }],
    history: [
      visit("https://bbs.ruliweb.com/community/board/300143", "유게 잡담 커뮤니티 | 루리웹", 0),
      visit("https://gall.dcinside.com/board/lists/?id=programming", "프로그래밍 갤러리", 1),
      visit("https://gall.dcinside.com/board/lists/?id=programming", "프로그래밍 갤러리", 2),
      visit("https://gall.dcinside.com/board/lists/?id=programming", "프로그래밍 갤러리", 3),
      visit("https://example.com/", "Example Domain", 30),
      visit("https://www.rust-lang.org/", "Rust Programming Language", 10),
    ],
  };

  it("빈 입력이면 아무것도 없음", () => expect(suggest("  ", src, { now: NOW })).toEqual([]));

  it("첫 줄은 입력한 그대로: 주소면 이동, 아니면 검색", () => {
    expect(suggest("example.com", src, { now: NOW })[0]).toMatchObject({ kind: "go", url: "https://example.com" });
    expect(suggest("유머", src, { now: NOW })[0]).toMatchObject({ kind: "search" });
  });

  it("첫 줄과 같은 주소는 후보에서 뺀다", () => {
    const urls = suggest("example.com", src, { now: NOW }).map((s) => s.url);
    expect(urls.filter((u) => bareUrl(u) === "example.com")).toHaveLength(1);
  });

  it("같은 주소의 기록 여러 번 + 북마크는 하나로, 북마크 폴더 이름 포함", () => {
    const s = suggest("루리웹", src, { now: NOW }).filter((x) => x.url.includes("300143"));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "bookmark", title: "유머 게시판", folder: "커뮤니티" });
  });

  it("북마크는 폴더 이름으로도 찾는다", () => {
    expect(suggest("커뮤니티", src, { now: NOW })[1]).toMatchObject({ kind: "bookmark", folder: "커뮤니티" });
  });

  it("북마크가 기록보다 위", () => {
    const s = suggest("com", src, { now: NOW }).slice(1);
    expect(s[0].kind).toBe("bookmark");
  });

  it("주소 앞부분이 맞으면 위로 (gall → dcinside 가 rust 보다 먼저)", () => {
    const s = suggest("gall", src, { now: NOW });
    expect(s[1].url).toContain("dcinside");
  });

  it("주소 중간 부분(경로, 하위 도메인)도 앞부분 일치로 본다", () => {
    const s = suggest("dcinside", src, { now: NOW }).slice(1);
    expect(s[0].url).toContain("dcinside");
  });

  it("낱말 여러 개는 모두 들어 있어야 후보", () => {
    const s = suggest("programming 갤러리", src, { now: NOW }).slice(1);
    expect(s.map((x) => x.title)).toEqual(["프로그래밍 갤러리"]);
  });

  it("방문이 많고 최근일수록 위 (programming: 3번 방문한 디시 > 1번 방문한 rust)", () => {
    const s = suggest("programming", src, { now: NOW }).slice(1);
    expect(s.map((x) => x.url)).toEqual(["https://gall.dcinside.com/board/lists/?id=programming", "https://www.rust-lang.org/"]);
  });

  it("후보는 limit 개까지 (+ 첫 줄)", () => {
    const many = { bookmarks: [], history: Array.from({ length: 20 }, (_, i) => visit(`https://site${i}.com/`, `사이트 ${i}`)) };
    expect(suggest("사이트", many, { now: NOW, limit: 5 })).toHaveLength(6);
  });

  it("주소만 기록된 방문(제목 없음)은 다음 방문의 제목을 쓴다", () => {
    const s = suggest("a.org", { bookmarks: [], history: [visit("https://a.org/x", "https://a.org/x", 1), visit("https://a.org/x", "에이", 0)] }, { now: NOW });
    expect(s[1].title).toBe("에이");
  });
});
