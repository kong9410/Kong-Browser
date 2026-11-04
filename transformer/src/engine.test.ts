// 엔진 단위 테스트: 작은 HTML 조각 + 가짜 DOM 으로 탐지·판정·메뉴 읽기를 검사한다
import { beforeEach, describe, expect, it } from "vitest";
import { judge } from "./judge.js";
import { buildBoard, buildHub, buildPost, fitCss, mount } from "./layout.js";
import { inContext } from "./keep.js";
import { readLogo, siteMark } from "./logo.js";
import { setNavOptions } from "./nav.js";
import { observeHub } from "./observe.js";
import { cleanText, hit, locate, pickPage, type LocatedBoard, type LocatedHub, type LocatedPost } from "./locate.js";
import { extractMenu } from "./menu.js";
import type { Recipe } from "./recipe.js";
import { isVisited, setVisited, visitKey } from "./visited.js";

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
        image: "i.pic, [data-type=icon_pic]",
        video: "i.movie",
      },
    },
    {
      id: "hub",
      type: "hub",
      match: "^/(ps|pc)/?$",
      probe: [".hub"],
      title: { sel: ["head > title"], pattern: "^(.+?)\\s*\\|" },
      ads: { sel: ["#ad_top, #ad_bottom"], exclude: [".close"] },
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

describe("첫 화면 (게시판에 들어가기 전)", () => {
  const html = `<div class="hub"><div id="ad_top">위 광고<button class="close">x</button></div>
    <div class="news">뉴스</div><div id="ad_bottom">아래 광고</div></div>`;

  it("제목과 광고만 남기고, 광고는 문서 순서대로", () => {
    page("https://example.test/ps", html);
    document.title = "PS5 | 테스트";
    const l = locate(document, pickPage(recipe, document).page!) as LocatedHub;
    expect(judge(l, recipe).verdict).toBe("ok");
    const root = buildHub(l, recipe);
    expect(root.dataset.page).toBe("hub");
    expect(root.querySelector(".k-title")?.textContent).toBe("PS5");
    expect([...root.querySelectorAll(".k-ad > *")].map((e) => e.id)).toEqual(["ad_top", "ad_bottom"]);
    expect(root.textContent).not.toContain("뉴스");
    expect(root.querySelector(".close")?.classList.contains("k-excluded")).toBe(true);
  });

  it("광고를 못 찾아도 깨진 화면이 아니라 경고만 (광고 차단 등)", () => {
    page("https://example.test/pc", `<div class="hub"><div class="news">뉴스</div></div>`);
    document.title = "PC | 테스트";
    expect(judge(locate(document, pickPage(recipe, document).page!), recipe)).toMatchObject({ verdict: "degraded", warnings: ["ads"] });
  });

  it("목록에 없는 첫 화면 주소는 고르지 않는다", () => {
    page("https://example.test/hobby", html);
    expect(pickPage(recipe, document).candidates).toEqual([]);
  });
});

describe("목록의 이미지·동영상 표시", () => {
  it("행 안의 아이콘이나 행 자신의 표시로 알아내고, 제목 뒤에 아이콘을 붙인다", () => {
    page(
      "https://example.test/board/1",
      `<table class="list">
        <tr class="row"><td><a href="/board/1/read/1">글자만</a></td></tr>
        <tr class="row"><td><a href="/board/1/read/2">그림 <i class="pic"></i></a></td></tr>
        <tr class="row" data-type="icon_pic"><td><a href="/board/1/read/3">디시식 그림</a></td></tr>
        <tr class="row"><td><a href="/board/1/read/4">영상 <i class="movie"></i></a></td></tr>
      </table>`,
    );
    const l = locate(document, pickPage(recipe, document).page!) as LocatedBoard;
    expect(l.rows.map((r) => [r.image, r.video])).toEqual([[false, false], [true, false], [true, false], [false, true]]);
    const rows = [...buildBoard(l, recipe).root.querySelectorAll(".k-row-title")];
    expect(rows.map((t) => [...t.querySelectorAll(".k-media")].map((m) => (m as HTMLElement).title))).toEqual([[], ["이미지"], ["이미지"], ["동영상"]]);
    expect(rows[1].textContent).toBe("그림");
  });

  it("썸네일이 있는 행은 왼쪽에 작은 그림 (디시 실시간 베스트), 없는 행은 그대로", () => {
    page(
      "https://example.test/board/1",
      `<table class="list">
        <tr class="row"><td><a href="/board/1/read/1"><div class="thumimg"><img src="//cdn.test/t1.jpg" alt="썸네일"></div>[갤] 썸네일 글</a></td></tr>
        <tr class="row"><td><a href="/board/1/read/2">그림 없는 글</a></td></tr>
        <tr class="row"><td><a href="/board/1/read/3"><div class="thumimg"><img src="javascript:alert(1)"></div>이상한 주소</a></td></tr>
      </table>`,
    );
    const thumbRecipe: Recipe = {
      ...recipe,
      pages: recipe.pages.map((p) => (p.type === "board" ? { ...p, rows: { ...p.rows, thumbnail: { sel: [".thumimg img"] } } } : p)),
    };
    const l = locate(document, pickPage(thumbRecipe, document).page!) as LocatedBoard;
    expect(l.rows.map((r) => r.thumbnail)).toEqual(["https://cdn.test/t1.jpg", null, null]);
    expect(l.rows[0].title).toBe("[갤] 썸네일 글");
    const root = buildBoard(l, thumbRecipe).root;
    const rows = [...root.querySelectorAll("a.k-row")];
    expect(rows.map((r) => r.classList.contains("k-has-thumb"))).toEqual([true, false, false]);
    expect((rows[0].querySelector("img.k-thumb") as HTMLImageElement).getAttribute("src")).toBe("https://cdn.test/t1.jpg");
    expect(rows[0].querySelector(".k-row-body .k-row-title")?.textContent).toBe("[갤] 썸네일 글");
  });

  it("제목 아래 한 줄(extra): 에펨코리아 핫딜의 쇼핑몰·가격·배송 (게으른 로딩 썸네일은 attr 로 진짜 주소)", () => {
    page(
      "https://example.test/board/1",
      `<table class="list">
        <tr class="row"><td><img class="thumb" src="/blank.gif" data-original="//cdn.test/t.webp"><a href="/board/1/read/1">새우 1kg</a><div class="info">쇼핑몰: <b>네이버</b> / 가격: <b>21,320원</b></div></td></tr>
        <tr class="row"><td><a href="/board/1/read/2">정보 없음</a></td></tr>
      </table>`,
    );
    const r2: Recipe = {
      ...recipe,
      pages: recipe.pages.map((p) =>
        p.type === "board" ? { ...p, rows: { ...p.rows, extra: { sel: [".info"] }, thumbnail: { sel: ["img.thumb"], attr: "data-original" } } } : p,
      ),
    };
    const l = locate(document, pickPage(r2, document).page!) as LocatedBoard;
    expect(l.rows.map((r) => r.extra)).toEqual(["쇼핑몰: 네이버 / 가격: 21,320원", null]);
    expect(l.rows[0].thumbnail).toBe("https://cdn.test/t.webp");
    const rows = [...buildBoard(l, r2).root.querySelectorAll("a.k-row")];
    expect(rows[0].querySelector(".k-row-body .k-row-extra")?.textContent).toBe("쇼핑몰: 네이버 / 가격: 21,320원");
    expect(rows[1].querySelector(".k-row-extra")).toBeNull();
  });
});

describe("읽은 글 표시 (앱의 방문 기록)", () => {
  it("열쇠: 경로만, 또는 글을 가리키는 쿼리만 (페이지 번호 등은 무시)", () => {
    expect(visitKey("https://bbs.example.test/board/1/read/9?page=2")).toBe(visitKey("https://bbs.example.test/board/1/read/9?"));
    const dc = ["id", "no"];
    expect(visitKey("https://g.test/board/view/?id=a&no=5&page=1", dc)).toBe(visitKey("https://g.test/board/view/?no=5&page=3&id=a", dc));
    expect(visitKey("https://g.test/board/view/?id=a&no=5", dc)).not.toBe(visitKey("https://g.test/board/view/?id=a&no=6", dc));
  });

  it("글 번호 규칙(visitPattern): 여러 주소 모양의 같은 글을 하나로 (에펨코리아)", () => {
    const fm = { pattern: "(?:document_srl=|^/(?:best2?/)?)([0-9]{6,})" };
    const k = visitKey("https://www.fmkorea.com/10517941707", fm);
    expect(visitKey("https://www.fmkorea.com/best/10517941707", fm)).toBe(k);
    expect(visitKey("https://www.fmkorea.com/index.php?mid=best2&sort_index=pop&order_type=desc&document_srl=10517941707", fm)).toBe(k);
    expect(visitKey("https://www.fmkorea.com/10517941708", fm)).not.toBe(k);
    // 규칙에 안 맞는 주소(게시판 목록)는 지금처럼 경로로
    expect(visitKey("https://www.fmkorea.com/humor", fm)).toBe("www.fmkorea.com/humor");
    // 잘못된 정규식이면 경로 방식으로
    expect(visitKey("https://www.fmkorea.com/123456", { pattern: "(" })).toBe("www.fmkorea.com/123456");
    setVisited(["https://www.fmkorea.com/best/10517941707"]);
    expect(isVisited("https://www.fmkorea.com/index.php?mid=best2&document_srl=10517941707", fm)).toBe(true);
    expect(isVisited("https://www.fmkorea.com/10518310830", fm)).toBe(false);
  });

  it("방문한 글 행에 표시를 붙이고, 누른 글은 바로 표시", () => {
    page(
      "https://example.test/board/1",
      `<table class="list">
        <tr class="row"><td><a href="/board/1/read/1">읽음</a></td></tr>
        <tr class="row"><td><a href="/board/1/read/2">안 읽음</a></td></tr>
        <tr class="row"><td><a href="/board/1/read/3">세 번째</a></td></tr>
      </table>`,
    );
    setVisited(["https://example.test/board/1/read/1?page=4"]);
    const root = buildBoard(locate(document, pickPage(recipe, document).page!) as LocatedBoard, recipe).root;
    const rows = [...root.querySelectorAll<HTMLAnchorElement>("a.k-row")];
    expect(rows.map((a) => a.classList.contains("k-visited"))).toEqual([true, false, false]);
    rows[1].addEventListener("click", (e) => e.preventDefault()); // 테스트에서 실제 이동은 막는다
    rows[1].click();
    expect(rows[1].classList.contains("k-visited")).toBe(true);
    expect(isVisited("https://example.test/board/1/read/2")).toBe(true);
    setVisited([]);
  });
});

describe("폰 화면", () => {
  it("통합 화면을 붙이면 기기 폭으로 그리도록 viewport 를 바꾼다 (사이트의 width=1159 대신)", () => {
    page("https://example.test/ps", `<div class="hub"><div id="ad_top">광고</div></div>`);
    document.head.innerHTML = `<meta name="viewport" content="width=1159"><title>PS5 | 테스트</title>`;
    mount(buildHub(locate(document, pickPage(recipe, document).page!) as LocatedHub, recipe));
    expect(document.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    expect(document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content).toBe("width=device-width, initial-scale=1");
  });

  it("좁은 화면에서 ☰ 메뉴는 서랍으로 열고, 바깥을 누르면 닫힌다 (PC 펼침 설정은 그대로)", () => {
    (window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }).happyDOM.setViewport({ width: 400, height: 800 });
    const toggles: boolean[] = [];
    setNavOptions({ open: true, onToggle: (v) => toggles.push(v) });
    page("https://example.test/ps", `<ul id="gnb"><li><a href="/ps">PS</a></li></ul><div class="hub"></div>`);
    const root = buildHub(locate(document, pickPage(recipe, document).page!) as LocatedHub, recipe);
    root.querySelector<HTMLButtonElement>(".k-nav-open")!.click();
    expect(root.classList.contains("k-drawer")).toBe(true);
    root.querySelector<HTMLElement>(".k-nav-backdrop")!.click();
    expect(root.classList.contains("k-drawer")).toBe(false);
    expect(toggles).toEqual([]);
    (window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }).happyDOM.setViewport({ width: 1280, height: 800 });
  });
});

describe("사이트 로고 (누르면 홈)", () => {
  it("로고 링크 안의 그림을 읽어 머리에 로고 링크로 그린다", () => {
    page("https://example.test/board/1", `<div id="hd"><a href="https://www.example.test"><img src="/img/logo.png" alt="로고"></a></div>`);
    expect(readLogo({ ...recipe, logo: { sel: ["#hd a"] } })).toEqual({ href: "https://www.example.test/", src: "https://example.test/img/logo.png" });
    const mark = siteMark({ ...recipe, logo: { sel: ["#hd a"] } }) as HTMLAnchorElement;
    expect(mark.tagName).toBe("A");
    expect(mark.href).toBe("https://www.example.test/");
    expect(mark.querySelector("img")?.getAttribute("alt")).toBe("테스트");
  });

  it("그림이 CSS 배경이면 그 주소를 쓴다 (글자를 숨긴 로고)", () => {
    page("https://example.test/board/1", `<h1><a class="logo" href="/" style="background-image: url('https://cdn.test/logo.svg')"><span>테스트</span></a></h1>`);
    expect(readLogo({ ...recipe, logo: { sel: ["h1 a.logo"] } })?.src).toBe("https://cdn.test/logo.svg");
  });

  it("로고를 못 찾으면 사이트 이름 글자", () => {
    page("https://example.test/board/1", `<div></div>`);
    const mark = siteMark({ ...recipe, logo: { sel: ["#none a"] } });
    expect(mark.tagName).toBe("DIV");
    expect(mark.textContent).toBe("테스트");
  });
});

describe("게시판 안 검색", () => {
  it("사이트의 검색 영역을 목록 아래(페이지 번호 다음)로 옮긴다", () => {
    const rows = [1, 2, 3].map((i) => `<tr class="row"><td><a href="/board/1/read/${i}">글${i}</a></td></tr>`).join("");
    page("https://example.test/board/1", `<table class="list">${rows}</table><div class="paging">1 2</div><form class="sch"><input name="q"></form>`);
    const r: Recipe = JSON.parse(JSON.stringify(recipe));
    const board = r.pages.find((p) => p.id === "board") as Extract<Recipe["pages"][number], { type: "board" }>;
    board.pager = { sel: [".paging"] };
    board.search = { sel: ["form.sch"] };
    const l = locate(document, pickPage(r, document).page!) as LocatedBoard;
    expect(judge(l, r).verdict).toBe("ok");
    const main = buildBoard(l, r).root.querySelector(".k-main")!;
    expect([...main.children].slice(-2).map((e) => e.className)).toEqual(["k-pager k-move", "k-search k-move"]);
    expect(main.querySelector(".k-search input[name=q]")).not.toBeNull();
  });
});

describe("사이트 로고 위치", () => {
  it("본문 머리가 아니라 통합 화면 맨 위 줄에", () => {
    const rows = [1, 2, 3].map((i) => `<tr class="row"><td><a href="/board/1/read/${i}">글${i}</a></td></tr>`).join("");
    page("https://example.test/board/1", `<div id="hd"><a href="/"><img src="/logo.png"></a></div><table class="list">${rows}</table>`);
    const r: Recipe = { ...recipe, logo: { sel: ["#hd a"] } };
    const root = buildBoard(locate(document, pickPage(r, document).page!) as LocatedBoard, r).root;
    expect(root.firstElementChild?.className).toBe("k-top");
    expect(root.querySelector(".k-top a.k-logo img")).not.toBeNull();
    expect(root.querySelector(".k-main .k-site")).toBeNull();
  });
});

describe("첫 화면: 사이트 블록을 모양 그대로 (디시 홈)", () => {
  const hubRecipe = (): Recipe => ({
    ...recipe,
    menu: [],
    side: [{ move: { sel: ["#rank"], keepStyle: true } }],
    pages: [
      {
        id: "home",
        type: "hub",
        match: "^/?$",
        probe: ["#container"],
        top: { sel: ["#search_wrap"], keepStyle: true },
        blocks: { sel: [".left_content .time_best, .left_content .concept"], keepStyle: true },
      },
    ],
  });
  const html = `<div id="top" class="dcwrap"><header><div id="search_wrap" class="wrap_search">검색</div></header>
    <main id="container"><section class="left_content"><div class="time_best">실베</div><div class="concept">개념글</div></section>
    <section class="right_content"><article><div id="rank" class="content_box">실북갤</div></article></section></main></div>`;

  it("검색 → 블록 순서로, 원래 조상을 본뜬 껍데기(k-ctx)로 감싸 사이트 CSS 가 맞게", () => {
    page("https://example.test/", html);
    const r = hubRecipe();
    const l = locate(document, pickPage(r, document).page!) as LocatedHub;
    expect(judge(l, r).verdict).toBe("ok");
    const root = buildHub(l, r);
    const main = root.querySelector(".k-main")!;
    expect([...main.children].map((c) => c.className)).toEqual(["k-hub-top k-keep", "k-hub-block k-keep", "k-hub-block k-keep"]);
    expect(main.querySelector(".k-head")).toBeNull(); // 제목 필드가 없으면 제목 줄 없음
    // 실베: div#top.dcwrap > main#container > section.left_content > div.time_best
    const best = main.querySelector(".time_best")!;
    expect(best.hasAttribute("data-kong-kept")).toBe(true);
    const chain: string[] = [];
    for (let a = best.parentElement; a && !a.classList.contains("k-keep"); a = a.parentElement) chain.unshift(`${a.tagName.toLowerCase()}.${a.className}`);
    expect(chain).toEqual(["div.dcwrap k-ctx", "main.k-ctx", "section.left_content k-ctx"]);
    expect(best.closest("main")?.id).toBe("container");
    // 오른쪽 열: 카드 모양 없이 그대로
    expect(root.querySelector(".k-side .k-side-keep.k-keep #rank")).not.toBeNull();
  });
});

describe("raw: 옮긴 내용 중 사이트 모양 그대로 둘 부분", () => {
  it("디시콘·텍스트콘에 k-raw 표시 (통합 화면의 색·크기 맞춤에서 빠짐)", () => {
    page(
      "https://example.test/board/1/read/10",
      `<div class="view"><h1 class="subject">제목</h1><div class="content">본문</div>
       <ul><li class="c"><span class="t"><div class="comment_dccon"><p>흰 글자</p></div></span></li></ul></div>`,
    );
    const r: Recipe = JSON.parse(JSON.stringify(recipe));
    const post = r.pages.find((p) => p.id === "post") as Extract<Recipe["pages"][number], { type: "post" }>;
    post.comments = { item: ["li.c"], content: { sel: [".t"], raw: [".comment_dccon"] } };
    const root = buildPost(locate(document, pickPage(r, document).page!) as LocatedPost, r).root;
    expect(root.querySelector(".k-cmt-body .comment_dccon")?.classList.contains("k-raw")).toBe(true);
  });
});

describe("첫 화면: 사이트가 늦게 채우는 메뉴", () => {
  it("최근 방문 갤러리처럼 나중에 붙는 링크도 왼쪽 메뉴에 반영 (디시 홈)", async () => {
    page("https://example.test/", `<div id="container"><ul class="vst_listbox"></ul></div>`);
    const r: Recipe = {
      ...recipe,
      menu: [{ label: "최근 방문 갤러리", groups: [".vst_listbox"], links: ["li > a"], current: "none" }],
      pages: [{ id: "home", type: "hub", match: "^/?$", probe: ["#container"] }],
    };
    const root = buildHub(locate(document, pickPage(r, document).page!) as LocatedHub, r);
    mount(root);
    observeHub();
    expect(root.querySelectorAll(".k-nav a").length).toBe(0);
    // 사이트가 저장소에서 읽어 와 목록을 채움 (원본 영역은 숨겨진 채)
    document.querySelector(".vst_listbox")!.innerHTML = `<li><a href="https://gall.dcinside.com/board/lists?id=a">갤A</a></li>`;
    await new Promise((res) => setTimeout(res, 300));
    expect([...root.querySelectorAll(".k-nav a")].map((a) => a.textContent)).toContain("갤A");
  });
});

describe("디시 레시피: 이미지 댓글", () => {
  it("본문 이미지에 달린 댓글(img_comment_li_)은 댓글 목록으로 옮기지 않고 본문의 이미지 아래에 글과 함께 둔다", async () => {
    const fs = await import("node:fs");
    // vitest 는 transformer/ 에서 실행된다
    const dc = JSON.parse(fs.readFileSync("../recipes/gall.dcinside.com.json", "utf8")) as Recipe;
    page(
      "https://gall.dcinside.com/board/view/?id=dcbest&no=1",
      `<div class="gallview_head"><span class="title_subject">제목</span></div>
       <div class="writing_view_box"><div class="write_div"><img src="a.jpg">
         <div class="comment_box"><ul><li id="img_comment_li_9" class="ub-content"><div class="clear cmt_txtbox"><p class="usertxt">이미지에 단 댓글</p></div></li></ul></div>
       </div></div>
       <div class="comment_box"><ul><li id="comment_li_1" class="ub-content"><div class="clear cmt_txtbox"><p class="usertxt">일반 댓글</p></div></li></ul></div>`,
    );
    const l = locate(document, pickPage(dc, document).page!) as LocatedPost;
    expect(l.comments.map((c) => c.content?.textContent?.trim())).toEqual(["일반 댓글"]);
    const root = buildPost(l, dc).root;
    expect(root.querySelector(".k-body #img_comment_li_9 .usertxt")?.textContent).toBe("이미지에 단 댓글");
  });
});

describe("fit: 사이트의 고정 폭 한 줄을 칸에 맞춤", () => {
  it("row·fill 을 통합 화면 안으로 한정한 CSS 규칙으로 (나중에 펼쳐지는 댓글에도 적용)", () => {
    const css = fitCss({ row: [".img_comment .addbox"], fill: [".img_comment .cmt_txtbox"] });
    expect(css).toContain(":is(#kong-root .img_comment .addbox){display:flex!important");
    expect(css).toContain(":is(#kong-root .img_comment .addbox)>*{float:none!important;flex:none}");
    expect(css).toContain(":is(#kong-root .img_comment .cmt_txtbox){float:none!important;width:auto!important;flex:1 1 0!important");
    expect(fitCss({ full: [".w textarea"] })).toBe(":is(#kong-root .w textarea){width:100%!important;max-width:100%!important;min-width:0!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}");
    expect(fitCss(undefined)).toBe("");
  });
  it("디시 레시피: 이미지 댓글 한 줄(닉네임 + 글 + 날짜)", async () => {
    const fs = await import("node:fs");
    const dc = JSON.parse(fs.readFileSync("../recipes/gall.dcinside.com.json", "utf8")) as Recipe;
    const post = dc.pages.find((p) => p.type === "post") as Extract<Recipe["pages"][number], { type: "post" }>;
    // 한 줄은 .addbox: 닉네임(.cmt_nickbox)·글(.cmt_txtbox)·날짜(.fr) 가 모두 그 안에 있다
    expect(post.fit?.row).toContain(".img_comment .addbox");
    expect(post.fit?.fill).toContain(".img_comment .cmt_txtbox");
  });
});

describe("글쓰기 버튼, 댓글 쓰기 칸", () => {
  it("게시판: 사이트의 [글쓰기] 를 제목 오른쪽으로", () => {
    const rows = [1, 2, 3].map((i) => `<tr class="row"><td><a href="/board/1/read/${i}">글${i}</a></td></tr>`).join("");
    page("https://example.test/board/1", `<table class="list">${rows}</table><div class="btns"><button class="write" onclick="goWrite()">글쓰기</button></div>`);
    const r: Recipe = JSON.parse(JSON.stringify(recipe));
    (r.pages.find((p) => p.id === "board") as Extract<Recipe["pages"][number], { type: "board" }>).write = { sel: [".btns .write"] };
    const l = locate(document, pickPage(r, document).page!) as LocatedBoard;
    const head = buildBoard(l, r).root.querySelector(".k-head")!;
    expect(head.classList.contains("k-head-row")).toBe(true);
    expect(head.querySelector(".k-head-tools button.write.k-write")?.textContent).toBe("글쓰기");
  });

  it("게시글: [목록]·[글쓰기] 한 줄, 댓글 쓰기 칸은 댓글 목록 바로 아래, [등록] 은 주 버튼", () => {
    page(
      "https://example.test/board/1/read/10",
      `<div class="view"><h1 class="subject">제목</h1><div class="content">본문</div>
       <div class="buttons"><a href="/board/1">목록</a><button class="w">글쓰기</button></div>
       <ul class="cmts"><li class="c"><span class="t">댓글</span></li></ul>
       <div class="cmt_write"><textarea></textarea><button class="add">등록</button></div></div>`,
    );
    const r: Recipe = JSON.parse(JSON.stringify(recipe));
    const post = r.pages.find((p) => p.id === "post") as Extract<Recipe["pages"][number], { type: "post" }>;
    post.write = { sel: [".buttons .w"] };
    post.commentWrite = { sel: [".cmt_write"], primary: [".add"] };
    post.comments = { item: ["li.c"], content: { sel: [".t"] } };
    const root = buildPost(locate(document, pickPage(r, document).page!) as LocatedPost, r).root;
    const row = root.querySelector(".k-list")!;
    expect([...row.children].map((e) => e.textContent)).toEqual(["목록", "글쓰기"]);
    const main = root.querySelector(".k-main")!;
    const order = [...main.children].map((e) => e.className.split(" ")[0]);
    expect(order.indexOf("k-cmt-write")).toBe(order.indexOf("k-comments") + 1);
    expect(main.querySelector(".k-cmt-write .add")?.classList.contains("k-primary")).toBe(true);
  });
});

describe("댓글 글쓴이: 사이트 표시 그대로 (아이콘·IP)", () => {
  it("whoNode 가 있으면 닉네임 옆 아이콘·IP 를 포함한 사이트 요소를 머리에, 없으면 글자", () => {
    page(
      "https://example.test/board/1/read/10",
      `<div class="view"><h1 class="subject">제목</h1><div class="content">본문</div><ul>
        <li class="c"><span class="w" data-nick="고닉"><span class="nickname"><em>고닉</em></span><a class="nikcon"><img src="fix_nik.gif"></a></span><span class="t">a</span></li>
        <li class="c"><span class="w" data-nick="ㅇㅇ"><span class="nickname"><em>ㅇㅇ</em><span class="ip">(1.2)</span></span></span><span class="t">b</span></li>
      </ul></div>`,
    );
    const r: Recipe = JSON.parse(JSON.stringify(recipe));
    const post = r.pages.find((p) => p.id === "post") as Extract<Recipe["pages"][number], { type: "post" }>;
    post.comments = {
      item: ["li.c"],
      who: { sel: [".w"], attr: "data-nick" },
      whoNode: { sel: [".w"], raw: [".nikcon", ".ip"] },
      content: { sel: [".t"] },
    };
    const root = buildPost(locate(document, pickPage(r, document).page!) as LocatedPost, r).root;
    const heads = [...root.querySelectorAll(".k-cmt-head .k-who")];
    expect(heads.map((w) => w.textContent)).toEqual(["고닉", "ㅇㅇ(1.2)"]);
    expect(heads[0].querySelector("img")?.getAttribute("src")).toBe("fix_nik.gif");
    expect(heads[0].querySelector(".nikcon")?.classList.contains("k-raw")).toBe(true);
    expect(heads[1].querySelector(".ip")?.classList.contains("k-raw")).toBe(true);
  });
});

describe("대댓글: 댓글을 누르면 사이트가 여는 답글 쓰기 칸", () => {
  const html = `<div class="view"><h1 class="subject">제목</h1><div class="content">본문</div>
    <ul class="cmts">
      <li id="c1" class="c"><div class="info" data-no="1"><span class="t">첫 댓글</span></div></li>
      <li id="c2" class="c"><div class="info" data-no="2"><span class="t">둘째 댓글</span></div></li>
    </ul></div>`;
  const setup = () => {
    page("https://example.test/board/1/read/10", html);
    const r: Recipe = JSON.parse(JSON.stringify(recipe));
    const post = r.pages.find((p) => p.id === "post") as Extract<Recipe["pages"][number], { type: "post" }>;
    post.comments = { item: ["li.c"], content: { sel: [".t"], context: true }, replyWrite: { sel: [".cmts .reply_form"] } };
    const view = buildPost(locate(document, pickPage(r, document).page!) as LocatedPost, r);
    mount(view.root);
    return view;
  };

  it("context: 옮긴 댓글 내용이 원래 조상(속성 포함) 껍데기 안에 있어 사이트가 조상에서 댓글 번호를 찾을 수 있다", () => {
    const view = setup();
    const t = view.root.querySelector(".k-cmt-body .t")!;
    expect(t.closest(".info")?.getAttribute("data-no")).toBe("1");
    // 원본을 숨기는 엔진 표시는 껍데기에 옮기지 않는다
    expect(view.root.querySelector(".k-cmt-body .k-orig")).toBeNull();
  });

  it("원본 쪽에 생긴 답글 칸을 바로 앞 댓글 아래로 옮기고, 사이트가 원래 자리를 지우면 같이 사라진다", () => {
    const view = setup();
    // 사이트: 첫 댓글 뒤에 답글 칸을 끼워 넣음 (숨겨진 원본 목록)
    const holder = document.createElement("li");
    holder.id = "reply_empty_1";
    holder.innerHTML = `<div class="reply_form"><textarea></textarea></div>`;
    document.getElementById("c1")!.after(holder);
    view.syncReplyForms();
    const forms = [...view.root.querySelectorAll(".k-reply-write")];
    expect(forms).toHaveLength(1);
    expect(forms[0].previousElementSibling?.textContent).toContain("첫 댓글");
    // 사이트가 칸을 닫음 (원래 자리 통째로 지움)
    holder.remove();
    view.syncReplyForms();
    expect(view.root.querySelectorAll(".k-reply-write")).toHaveLength(0);
  });
});

describe("inContext (원래 조상 껍데기)", () => {
  it("속성(id·class·data-*)은 옮겨 적고, style·인라인 처리기·엔진 표시(k-hidden 등)는 빼고, 껍데기 표시를 붙인다", () => {
    page(
      "https://example.test/",
      `<div id="top" class="wrap k-hidden" style="width:1160px" onclick="x()" data-kong-done="1"><ul class="list" p-no="7"><li><span class="t">글</span></li></ul></div>`,
    );
    const wrapped = inContext(document.querySelector(".t")!);
    expect(wrapped.tagName).toBe("DIV");
    expect(wrapped.id).toBe("top");
    expect([...wrapped.classList]).toEqual(["wrap", "k-ctx"]);
    expect(wrapped.hasAttribute("style") || wrapped.hasAttribute("onclick") || wrapped.hasAttribute("data-kong-done")).toBe(false);
    expect(wrapped.querySelector("ul.list.k-ctx")?.getAttribute("p-no")).toBe("7");
  });
});

describe("fit: 넓은 화면 기준 배치를 칸에 맞춤 (디시 글쓰기 화면)", () => {
  it("tight·static·right 규칙", () => {
    const css = fitCss({ tight: ["#w"], static: [".g"], right: [{ sel: ".b", px: 56 }, { sel: ".c" }] });
    expect(css).toContain(":is(#kong-root #w){padding-left:16px!important;padding-right:16px!important}");
    expect(css).toContain(":is(#kong-root .g){position:static!important}");
    expect(css).toContain(":is(#kong-root .b){left:auto!important;right:56px!important}");
    expect(css).toContain(":is(#kong-root .c){left:auto!important;right:0px!important}");
  });
  it("디시 레시피: 글쓰기 화면은 왼쪽 메뉴·제목은 통합 화면, 글쓰기 칸은 디시 컴포넌트 그대로", async () => {
    const fs = await import("node:fs");
    const dc = JSON.parse(fs.readFileSync("../recipes/gall.dcinside.com.json", "utf8")) as Recipe;
    const w = dc.pages.find((p) => p.id === "write") as Extract<Recipe["pages"][number], { type: "hub" }>;
    expect(new RegExp(w.match).test("/mgallery/board/write/?id=x")).toBe(true);
    expect(w.blocks).toMatchObject({ sel: ["#write_wrap"], keepStyle: true });
    page("https://gall.dcinside.com/board/write/?id=programming", `<main id="container"><section><article id="write_wrap"><form><input id="subject"></form></article></section></main>`);
    document.title = "프로그래밍 갤러리";
    const l = locate(document, pickPage(dc, document).page!) as LocatedHub;
    const root = buildHub(l, dc);
    expect(root.querySelector(".k-title")?.textContent).toBe("프로그래밍 갤러리");
    expect(root.querySelector(".k-main .k-hub-block.k-keep #write_wrap #subject")).not.toBeNull();
  });
});

describe("원본 숨기기", () => {
  it("재배치 때 body 바로 아래에 있던 것만 숨기고, 사이트가 나중에 다른 곳으로 옮기면 보인다 (디시 디시콘 층)", async () => {
    page("https://example.test/ps", `<div class="hub"><div class="toolbar"></div></div><div id="div_con" style="display:none">디시콘</div>`);
    document.title = "PS5 | 테스트";
    const root = buildHub(locate(document, pickPage(recipe, document).page!) as LocatedHub, recipe);
    mount(root);
    const layer = document.getElementById("div_con")!;
    const hiddenRule = "html.kong-on body > .k-orig";
    expect(layer.matches(hiddenRule)).toBe(true);
    // 사이트가 층을 도구줄로 옮겨 연다
    document.querySelector(".toolbar")!.appendChild(layer);
    expect(layer.matches(hiddenRule)).toBe(false);
    // 사이트가 다시 body 로 돌려놔도 숨지 않는다 (표시를 뗐으므로)
    await new Promise((r) => setTimeout(r, 0));
    document.body.appendChild(layer);
    expect(layer.matches(hiddenRule)).toBe(false);
    // 숨기는 규칙이 바로 이것 (style.css)
    const fs = await import("node:fs");
    expect(fs.readFileSync("src/style.css", "utf8")).toContain("html.kong-on body > .k-orig,");
  });
});

describe("사이트 계정 영역 (로그인 등)", () => {
  it("레시피 account 를 맨 위 줄 오른쪽(로고 맞은편)에, keepStyle 이면 사이트 모양 그대로", () => {
    const rows = [1, 2, 3].map((i) => `<tr class="row"><td><a href="/board/1/read/${i}">글${i}</a></td></tr>`).join("");
    page("https://example.test/board/1", `<header><div id="hd"><a href="/"><img src="/l.png"></a></div><div class="links"><a href="/login">로그인</a></div></header><table class="list">${rows}</table>`);
    const r: Recipe = { ...recipe, logo: { sel: ["#hd a"] }, account: { sel: ["header .links"], keepStyle: true } };
    const root = buildBoard(locate(document, pickPage(r, document).page!) as LocatedBoard, r).root;
    const top = root.querySelector(".k-top")!;
    expect([...top.children].map((e) => e.className)).toEqual(["k-site k-logo", "k-account k-keep"]);
    expect(top.querySelector(".k-account a[href='/login']")?.textContent).toBe("로그인");
  });
});
