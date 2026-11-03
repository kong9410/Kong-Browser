// 엔진 단위 테스트: 작은 HTML 조각 + 가짜 DOM 으로 탐지·판정·메뉴 읽기를 검사한다
import { beforeEach, describe, expect, it } from "vitest";
import { judge } from "./judge.js";
import { cleanText, hit, locate, pickPage } from "./locate.js";
import { extractMenu } from "./menu.js";
import type { Recipe } from "./recipe.js";

/** 가짜 DOM 의 주소와 본문을 정한다 */
function page(url: string, html: string) {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
  document.body.innerHTML = html;
}

const recipe: Recipe = {
  schemaVersion: 2,
  host: "example.test",
  version: 1,
  minEngine: 1,
  siteName: "테스트",
  menu: [
    { label: "상단", groups: ["#gnb"], links: [":scope > li > a"], current: "prefix", style: "chips" },
    { label: "표시", groups: ["#marked"], links: ["li > a"], current: "mark", mark: ".on" },
    { label: "게시판", groups: ["#boards"], links: ["a"] },
  ],
  pages: [
    {
      id: "post",
      type: "post",
      match: "^/board/[0-9]+/read/[0-9]+",
      probe: [".view"],
      title: { sel: [".subject"], exclude: [".count"], required: true },
      body: { sel: [".content"], required: true },
      views: { sel: [".info"], pattern: "조회\\s*([0-9,]+)" },
      listLink: { sel: [".buttons a"], text: "^목록$" },
    },
    {
      id: "board",
      type: "board",
      match: "^/board/[0-9]+/?$",
      probe: [".list"],
      rows: {
        sameBoard: "/board/([0-9]+)",
        scope: [".list"],
        item: ["tr.row"],
        title: { sel: ["a"] },
        link: { sel: ["a"] },
      },
    },
  ],
};

describe("hit (필드 하나 찾기)", () => {
  beforeEach(() =>
    page(
      "https://example.test/board/1/read/10",
      `<div class="view"><h1 class="subject">제목 <span class="count">(3)</span></h1>
       <p class="info">작성자 | 조회 1,234 | 추천 5</p>
       <div class="buttons"><a href="/write">글쓰기</a><a href="/board/1">목록</a></div>
       <div class="content">본문</div></div>`,
    ),
  );

  it("exclude 로 뺀 부분 없이 글자를 읽는다 (원본은 그대로)", () => {
    expect(hit(document, { sel: [".subject"], exclude: [".count"] })?.value).toBe("제목");
    expect(cleanText(document.querySelector(".subject")?.textContent)).toBe("제목 (3)");
  });

  it("pattern 의 첫 캡처 그룹을 값으로 쓴다", () => {
    expect(hit(document, { sel: [".info"], pattern: "조회\\s*([0-9,]+)" })?.value).toBe("1,234");
  });

  it("text 로 여러 버튼 중 하나를 고른다", () => {
    expect(hit(document, { sel: [".buttons a"], text: "^목록$" })?.el?.getAttribute("href")).toBe("/board/1");
  });

  it("sel 배열은 앞에서부터 처음 맞는 것을 쓴다 (새 셀렉터를 앞에 추가하는 수리 방식)", () => {
    expect(hit(document, { sel: [".renamed", ".subject"], exclude: [".count"] })?.value).toBe("제목");
  });

  it("잘못된 셀렉터가 있어도 죽지 않는다", () => {
    expect(hit(document, { sel: ["::invalid((", ".content"] })?.value).toBe("본문");
  });
});

describe("판정", () => {
  it("필수 필드를 못 찾으면 broken", () => {
    page("https://example.test/board/1/read/10", `<div class="view"><div class="content">본문</div></div>`);
    const p = pickPage(recipe, document).page!;
    expect(judge(locate(document, p), recipe)).toMatchObject({ verdict: "broken", failed: ["title"] });
  });

  it("주소는 맞는데 표식(probe)이 없으면 페이지를 고르지 않는다 (사이트 개편)", () => {
    page("https://example.test/board/1/read/10", `<div class="new-layout"></div>`);
    const r = pickPage(recipe, document);
    expect(r.page).toBeNull();
    expect(r.candidates.map((p) => p.id)).toEqual(["post"]);
  });

  it("선택 필드만 없으면 degraded", () => {
    page("https://example.test/board/1/read/10", `<div class="view"><h1 class="subject">제목</h1><div class="content">본문</div></div>`);
    const p = pickPage(recipe, document).page!;
    expect(judge(locate(document, p), recipe)).toMatchObject({ verdict: "degraded", warnings: ["views", "listLink"] });
  });

  it("목록에 다른 게시판 글이 섞이면 broken (sameBoard)", () => {
    const rows = (ids: number[]) => ids.map((b, i) => `<tr class="row"><td><a href="/board/${b}/read/${i}">글${i}</a></td></tr>`).join("");
    page("https://example.test/board/1", `<table class="list">${rows([1, 1, 1, 1, 1])}</table>`);
    expect(judge(locate(document, pickPage(recipe, document).page!), recipe).verdict).toBe("ok");
    page("https://example.test/board/1", `<table class="list">${rows([1, 1, 1, 1, 2])}</table>`);
    expect(judge(locate(document, pickPage(recipe, document).page!), recipe)).toMatchObject({
      verdict: "broken",
      failed: ["rows:otherBoards(1/5)"],
    });
  });
});

describe("메뉴 읽기와 지금 위치 강조", () => {
  const html = `
    <ul id="gnb"><li><a href="/">홈</a></li><li><a href="/game">게임</a></li><li><a href="/board">게시판</a></li></ul>
    <ul id="marked"><li><a href="/a">가</a></li><li class="on"><a href="/b">나</a></li><li><a href="javascript:;">스크립트</a></li></ul>
    <div id="boards"><a href="/board/1">자유</a><a href="/board/1?cat=2">자유-말머리</a><a href="/board/2">질문</a></div>`;

  it("prefix: 주소 경로가 링크로 시작하는 것 중 가장 긴 것 하나", () => {
    page("https://example.test/board/1/read/10", html);
    const groups = extractMenu(recipe)!.groups;
    const current = (title: string) => groups.find((g) => g.title === title)!.links.filter((l) => l.current).map((l) => l.text);
    expect(current("상단")).toEqual(["게시판"]);
  });

  it("mark: 사이트가 붙여 둔 표시를 따른다, javascript: 링크는 뺀다", () => {
    page("https://example.test/x", html);
    const g = extractMenu(recipe)!.groups.find((x) => x.title === "표시")!;
    expect(g.links.map((l) => l.text)).toEqual(["가", "나"]);
    expect(g.links.filter((l) => l.current).map((l) => l.text)).toEqual(["나"]);
  });

  it("board: 같은 게시판 링크가 여럿이면 하나만 (주소가 같으면 그것, 아니면 가장 짧은 것)", () => {
    page("https://example.test/board/1/read/10", html);
    const g = extractMenu(recipe)!.groups.find((x) => x.title === "게시판")!;
    expect(g.links.filter((l) => l.current).map((l) => l.text)).toEqual(["자유"]);
    page("https://example.test/board/1?cat=2", html);
    const g2 = extractMenu(recipe)!.groups.find((x) => x.title === "게시판")!;
    expect(g2.links.filter((l) => l.current).map((l) => l.text)).toEqual(["자유-말머리"]);
  });
});
