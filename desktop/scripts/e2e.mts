// npm run e2e — 실제 Electron 앱을 띄워 툴바를 조작하며 동작을 확인한다 (Playwright Electron 자동화)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
fs.mkdirSync(OUT, { recursive: true });

const BOARD = "https://bbs.ruliweb.com/community/board/300143";
const POST = "https://bbs.ruliweb.com/mobile/board/300008/read/2296589";

let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "✔" : "✘"} ${name}${detail !== "" ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};

async function launch(env: Record<string, string> = {}, executablePath?: string) {
  const app = await electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: [ROOT] }),
    // 실행마다 깨끗한 사용자 데이터 (탭 복원·북마크·기록이 이전 실행에 영향받지 않게). 복원 테스트는 같은 폴더를 넘긴다
    env: { ...process.env, KONG_TEST: "1", KONG_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "kong-profile-")), ...env } as Record<string, string>,
  });
  // 툴바와 시작 페이지 중 어느 쪽이 먼저 뜰지는 정해져 있지 않으므로 주소로 찾는다
  const isToolbar = (p: Page) => p.url().endsWith("/ui/index.html");
  const toolbar = app.windows().find(isToolbar) ?? (await app.waitForEvent("window", { predicate: isToolbar }));
  await toolbar.waitForSelector("#address");
  return { app, toolbar };
}

const hostOfUrl = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
const state = (app: ElectronApplication) => app.evaluate(() => (globalThis as any).__kong.state);
/** 페이지 DOM 에서 실행 (DOM 은 격리된 world 와 공유되므로 엔진 결과를 볼 수 있다) */
const inPage = <T,>(app: ElectronApplication, js: string) =>
  app.evaluate((_e, code) => (globalThis as any).__kong.page.webContents.executeJavaScript(code), js) as Promise<T>;

async function waitVerdict(app: ElectronApplication, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state(app);
    if (!s.loading && s.verdict) return s;
    await new Promise((r) => setTimeout(r, 300));
  }
  return state(app);
}

async function go(app: ElectronApplication, toolbar: Page, url: string) {
  await toolbar.fill("#address", url);
  await toolbar.press("#address", "Enter");
  await new Promise((r) => setTimeout(r, 500));
  return waitVerdict(app);
}

async function shot(app: ElectronApplication, toolbar: Page, name: string) {
  await toolbar.screenshot({ path: path.join(OUT, `${name}-toolbar.png`) });
  const png = await app.evaluate(async () => (await (globalThis as any).__kong.page.webContents.capturePage()).toPNG().toString("base64"));
  fs.writeFileSync(path.join(OUT, `${name}-page.png`), Buffer.from(png, "base64"));
}

// ---------- 1. 정상 레시피 ----------
{
  const { app, toolbar } = await launch();
  check("시작 페이지", (await state(app)).url.startsWith("file:"));

  let s = await go(app, toolbar, BOARD);
  const rows = await inPage<number>(app, `document.querySelectorAll("#kong-root a.k-row").length`);
  check("주소창 입력 → 게시판 통일 화면", s.verdict === "ok" && rows > 20, { verdict: s.verdict, rows });
  check("툴바 표시: 통일 화면", (await toolbar.textContent("#mode")) === "통일 화면");
  // Windows 가 다크 모드여도 앱은 밝은 모드
  const dark = await inPage<boolean>(app, `matchMedia("(prefers-color-scheme: dark)").matches`);
  const bg = await inPage<string>(app, `getComputedStyle(document.getElementById("kong-root")).backgroundColor`);
  check("밝은 모드가 기본 (OS 다크 모드와 무관)", !dark && bg === "rgb(247, 247, 245)", { dark, bg });
  await shot(app, toolbar, "board");

  // 왼쪽 메뉴 열 (통일 화면 안): 루리웹 상단 메뉴(칩) + 게시판 메뉴, 지금 위치 강조
  const navInfo = () =>
    inPage<{ has: boolean; closed: boolean; chips: number; links: number; current: string[] }>(
      app,
      `(() => { const r = document.getElementById("kong-root");
        return { has: !!r && r.classList.contains("k-has-nav"), closed: !!r && r.classList.contains("k-nav-closed"),
          chips: document.querySelectorAll("#kong-root .k-nav-chips .k-nav-link").length,
          links: document.querySelectorAll("#kong-root .k-nav-list .k-nav-link").length,
          current: Array.from(document.querySelectorAll("#kong-root .k-nav .k-current")).map(e => e.textContent) }; })()`,
    );
  let nav = await navInfo();
  check("왼쪽 메뉴: 상단 메뉴 + 게시판 메뉴, 지금 위치 강조", nav.has && !nav.closed && nav.chips >= 10 && nav.links > 20 && nav.current.some((c) => c.startsWith("커뮤니티")) && nav.current.length === 2, nav);
  // 오른쪽 열: 루리웹 게시판 BEST 글 목록
  const ruliSide = await inPage<{ has: boolean; title: string | null; posts: number }>(
    app,
    `({ has: document.getElementById("kong-root").classList.contains("k-has-side"),
        title: document.querySelector("#kong-root .k-side .k-nav-title")?.textContent ?? null,
        posts: Array.from(document.querySelectorAll("#kong-root .k-side .k-nav-link")).filter(a => a.href.includes("/read/")).length })`,
  );
  check("오른쪽 열: 유머 게시판 BEST 글 목록", ruliSide.has && /BEST/.test(ruliSide.title ?? "") && ruliSide.posts >= 10, ruliSide);
  // 접기 → 다음 페이지에서도 접힌 채로 (앱이 기억) → 펼치기
  await inPage(app, `document.querySelector("#kong-root .k-nav-close").click()`);
  await new Promise((r) => setTimeout(r, 300));
  nav = await navInfo();
  check("[접기] → 메뉴 접힘", nav.closed, nav);
  await go(app, toolbar, BOARD);
  nav = await navInfo();
  check("다시 열어도 접힌 상태 유지", nav.closed, nav);
  await inPage(app, `document.querySelector("#kong-root .k-nav-open").click()`);
  await new Promise((r) => setTimeout(r, 300));
  await go(app, toolbar, BOARD);
  nav = await navInfo();
  check("[☰ 메뉴] → 펼침, 다시 열어도 펼친 상태", !nav.closed, nav);
  // 메뉴에서 다른 게시판으로 이동 → 강조도 이동
  const target = await inPage<{ text: string; href: string } | null>(
    app,
    `(() => { const a = Array.from(document.querySelectorAll("#kong-root .k-nav-list .k-nav-link:not(.k-current)")).find(x => /\\/board\\/\\d+$/.test(x.href)); if (!a) return null; const r = { text: a.textContent, href: a.href }; a.click(); return r; })()`,
  );
  await new Promise((r) => setTimeout(r, 500));
  s = await waitVerdict(app);
  nav = await navInfo();
  check("메뉴 클릭 → 그 게시판으로 이동, 강조도 이동", !!target && s.url.startsWith(target.href) && nav.current.includes(target.text), { target, url: s.url, current: nav.current });
  await shot(app, toolbar, "menu");
  await go(app, toolbar, BOARD);

  // 목록에서 글 클릭 (페이지 안 링크 이동)
  await inPage(app, `document.querySelector("#kong-root a.k-row:not(.k-notice)").click()`);
  await new Promise((r) => setTimeout(r, 500));
  s = await waitVerdict(app);
  check("목록 → 글 이동", /\/read\//.test(s.url) && s.verdict === "ok", { url: s.url, verdict: s.verdict });
  check("뒤로 버튼 활성", !(await toolbar.isDisabled("#back")));

  s = await go(app, toolbar, POST);
  const c1 = await inPage<number>(app, `document.querySelectorAll("#kong-root .k-comments .k-cmt").length`);
  check("댓글 138개 글: 1페이지", s.verdict === "ok" && c1 === 100, { verdict: s.verdict, comments: c1 });
  await shot(app, toolbar, "post");

  // 맨 위/맨 아래 버튼: 맨 위에서는 ↓ 만, 맨 아래로 가면 ↑ 만
  const btns = () =>
    inPage<{ up: boolean; down: boolean; y: number; max: number }>(
      app,
      `(() => { const r = document.getElementById("kong-scroll-buttons")?.shadowRoot; const s = document.scrollingElement;
        return { up: !!r && !r.querySelector(".up").hidden, down: !!r && !r.querySelector(".down").hidden, y: Math.round(s.scrollTop), max: s.scrollHeight - innerHeight }; })()`,
    );
  let b = await btns();
  check("맨 위에서: ↓ 만 보임", !b.up && b.down, b);
  await inPage(app, `document.getElementById("kong-scroll-buttons").shadowRoot.querySelector(".down").click()`);
  await new Promise((r) => setTimeout(r, 1500));
  b = await btns();
  check("↓ 클릭 → 맨 아래, ↑ 만 보임", b.up && !b.down && b.y >= b.max - 5, b);
  await shot(app, toolbar, "post-bottom");
  await inPage(app, `document.getElementById("kong-scroll-buttons").shadowRoot.querySelector(".up").click()`);
  await new Promise((r) => setTimeout(r, 1500));
  b = await btns();
  check("↑ 클릭 → 맨 위", b.y === 0 && !b.up, b);

  // [목록] 버튼: 본문 아래, 댓글 위
  const listBtn = await inPage<{ text: string; href: string; beforeComments: boolean } | null>(
    app,
    `(() => { const a = document.querySelector("#kong-root .k-list a"); if (!a) return null;
      const c = document.querySelector("#kong-root .k-comments");
      return { text: a.textContent.trim(), href: a.href, beforeComments: !!(a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`,
  );
  check("[목록] 버튼: 본문 아래·댓글 위", listBtn?.text === "목록" && listBtn.beforeComments, listBtn);

  // 사이트 버튼이 격리된 world 에서도 동작하는지: 페이지의 confirm 을 가로채서 확인
  const confirmMsg = await inPage<string | null>(
    app,
    `new Promise(res => { window.confirm = m => { res(m); return false; }; document.querySelector("#kong-root .k-comments .btn_like").click(); setTimeout(() => res(null), 2000); })`,
  );
  check("댓글 추천 → 사이트 로그인 안내", !!confirmMsg?.includes("로그인"), confirmMsg);

  await inPage(app, `document.querySelector("#kong-root .k-more .btn_num:not(.active)").click()`);
  await new Promise((r) => setTimeout(r, 3000));
  const c2 = await inPage<number>(app, `document.querySelectorAll("#kong-root .k-comments .k-cmt").length`);
  check("댓글 2페이지", c2 === 38, { comments: c2 });

  // 원본 보기 ↔ 통일 화면
  await toolbar.click("#original");
  await new Promise((r) => setTimeout(r, 1000));
  s = await waitVerdict(app, 8000);
  const rootGone = await inPage<boolean>(app, `!document.getElementById("kong-root")`);
  check("원본 보기", s.original && rootGone && (await toolbar.textContent("#mode")) === "원본", { original: s.original, rootGone });
  const ob = await btns();
  check("원본 화면에서도 맨 아래 버튼", ob.down, ob);
  await shot(app, toolbar, "original");
  await toolbar.click("#original");
  await new Promise((r) => setTimeout(r, 1000));
  s = await waitVerdict(app);
  check("다시 통일 화면", !s.original && s.verdict === "ok");

  // 디시인사이드: 목록, 늦게 붙는 댓글(AJAX), 댓글 페이지
  s = await go(app, toolbar, "https://gall.dcinside.com/board/lists/?id=programming");
  const dcRows = await inPage<number>(app, `document.querySelectorAll("#kong-root a.k-row").length`);
  check("디시 목록 통일 화면", s.verdict === "ok" && dcRows > 30, { verdict: s.verdict, rows: dcRows });
  // 오른쪽 열: 전체글/개념글/공지 (사이트 버튼 그대로) → 개념글 클릭하면 개념글 목록
  const dcTabs = await inPage<string[]>(app, `Array.from(document.querySelectorAll("#kong-root .k-side .array_tab button")).map(b => b.textContent.trim())`);
  check("오른쪽 열: 디시 전체글·개념글·공지", dcTabs.join("|") === "전체글|개념글|공지", dcTabs);
  await inPage(app, `document.querySelector("#kong-root .k-side .array_tab button:nth-child(2)").click()`);
  await new Promise((r) => setTimeout(r, 500));
  s = await waitVerdict(app);
  check("개념글 클릭 → 개념글 목록 (통일 화면 유지)", /exception_mode=recommend/.test(s.url) && s.verdict === "ok", { url: s.url, verdict: s.verdict });
  await shot(app, toolbar, "dc-side");
  await shot(app, toolbar, "dc-board");
  s = await go(app, toolbar, "https://gall.dcinside.com/board/view/?id=programming&no=1476608");
  await new Promise((r) => setTimeout(r, 2500)); // 댓글 AJAX
  const dc1 = await inPage<{ n: number; title: string }>(
    app,
    `({ n: document.querySelectorAll("#kong-root .k-comments .k-cmt").length, title: document.querySelector("#kong-root .k-comments .k-sec-title")?.textContent })`,
  );
  s = await state(app);
  check("디시 글: 늦게 붙는 댓글 반영", s.verdict === "ok" && dc1.n >= 90, { verdict: s.verdict, ...dc1 });
  await shot(app, toolbar, "dc-post");
  await inPage(app, `document.querySelector("#kong-root .k-more a").click()`);
  await new Promise((r) => setTimeout(r, 3000));
  const dc2 = await inPage<number>(app, `document.querySelectorAll("#kong-root .k-comments .k-cmt").length`);
  check("디시 댓글 2페이지", dc2 > 0 && dc2 < dc1.n, { comments: dc2 });
  const dcNav = await inPage<{ titles: string[]; chips: string[]; current: string[]; links: string[] }>(
    app,
    `({ titles: Array.from(document.querySelectorAll("#kong-root .k-nav-title")).map(e => e.textContent),
        chips: Array.from(document.querySelectorAll("#kong-root .k-nav-chips .k-nav-link")).map(e => e.textContent),
        current: Array.from(document.querySelectorAll("#kong-root .k-nav .k-current")).map(e => e.textContent),
        links: Array.from(document.querySelectorAll("#kong-root .k-nav-link")).map(e => e.textContent) })`,
  );
  check(
    "디시 왼쪽 메뉴: 상단 메뉴(갤러리 강조) + 최근 방문 갤러리",
    dcNav.titles.join("|") === "디시 메뉴|최근 방문 갤러리" && dcNav.chips.includes("마이너갤") && !dcNav.chips.some((c) => c.includes("광고")) &&
      dcNav.current.includes("갤러리") && dcNav.links.includes("프로그래밍"),
    dcNav,
  );
  // 디시의 [목록] 버튼은 사이트 원래 버튼("전체글", goList(...))을 그대로 옮긴 것 → 누르면 목록으로
  await inPage(app, `document.querySelector("#kong-root .k-list button").click()`);
  await new Promise((r) => setTimeout(r, 500));
  s = await waitVerdict(app);
  check("디시 [목록](전체글) 클릭 → 갤러리 목록", /board\/lists/.test(s.url) && s.verdict === "ok", { url: s.url });

  // 마이너 갤러리 제목: 사이트의 "마이너" 아이콘 글자가 붙지 않게
  s = await go(app, toolbar, "https://gall.dcinside.com/mgallery/board/lists/?id=github");
  const mgTitle = await inPage<string | null>(app, `document.querySelector("#kong-root .k-head .k-title")?.textContent ?? null`);
  check("디시 마이너 갤러리 제목", s.verdict === "ok" && mgTitle === "Github 갤러리", { verdict: s.verdict, title: mgTitle });

  // 레시피 없는 사이트는 그대로
  s = await go(app, toolbar, "example.com");
  await new Promise((r) => setTimeout(r, 1000));
  s = await state(app);
  check("레시피 없는 사이트: 원본 그대로, 원본 보기 버튼 숨김", s.url.startsWith("https://example.com") && !s.verdict && (await toolbar.isHidden("#original")), { url: s.url, verdict: s.verdict });
  const ex = await btns();
  check("짧은 페이지: 맨 위/아래 버튼 둘 다 숨김", !ex.up && !ex.down, ex);

  // ---------- 탭 ----------
  const tabList = () => app.evaluate(() => (globalThis as any).__kong.tabs as { id: number; url: string; title: string; active: boolean }[]);
  const stripTabs = () => toolbar.evaluate(() => Array.from(document.querySelectorAll("#tabs .tab")).map((t) => ({ title: t.querySelector(".tab-title")!.textContent, active: t.classList.contains("active") })));
  let tl = await tabList();
  check("탭: 처음에는 1개", tl.length === 1 && tl[0].active, tl);
  await toolbar.click("#new-tab");
  await new Promise((r) => setTimeout(r, 800));
  tl = await tabList();
  const focused = await toolbar.evaluate(() => document.activeElement?.id);
  check("[+] → 새 탭(시작 페이지)이 열리고 주소창에 커서", tl.length === 2 && tl[1].active && tl[1].url.startsWith("file:") && focused === "address", { tl, focused });
  s = await go(app, toolbar, "https://gall.dcinside.com/board/lists/?id=programming");
  check("새 탭에서 디시 → 통일 화면", s.verdict === "ok", { verdict: s.verdict });
  const strip = await stripTabs();
  check("탭 줄에 두 탭 제목", strip.length === 2 && strip[1].active && /프로그래밍/.test(strip[1].title ?? ""), strip);
  // 첫 탭 클릭 → 그 탭의 페이지와 주소로 바뀜
  await toolbar.locator("#tabs .tab").first().click();
  await new Promise((r) => setTimeout(r, 500));
  s = await state(app);
  check("첫 탭 클릭 → 첫 탭 페이지로 전환", s.url.startsWith("https://example.com") && (await toolbar.inputValue("#address")).startsWith("https://example.com"), { url: s.url });
  // 새 창으로 여는 링크(target=_blank) → 새 탭
  await inPage(app, `(() => { const a = document.createElement("a"); a.href = "https://bbs.ruliweb.com/community/board/300143"; a.target = "_blank"; document.body.appendChild(a); a.click(); })()`);
  await new Promise((r) => setTimeout(r, 800));
  tl = await tabList();
  check("target=_blank 링크 → 바로 오른쪽에 새 탭으로", tl.length === 3 && tl[1].active && tl[1].url.includes("ruliweb"), tl);
  s = await waitVerdict(app);
  check("링크로 연 탭도 통일 화면", s.verdict === "ok", { verdict: s.verdict });
  // 단축키: Ctrl+Tab 다음 탭, Ctrl+1 첫 탭, Ctrl+W 닫기
  const key = (keyCode: string, modifiers: string[]) =>
    app.evaluate(({}, k) => {
      const w = (globalThis as any).__kong.win;
      w.webContents.sendInputEvent({ type: "keyDown", keyCode: k.keyCode, modifiers: k.modifiers });
      w.webContents.sendInputEvent({ type: "keyUp", keyCode: k.keyCode, modifiers: k.modifiers });
    }, { keyCode, modifiers });
  await key("Tab", ["control"]);
  await new Promise((r) => setTimeout(r, 400));
  tl = await tabList();
  check("Ctrl+Tab → 다음 탭", tl[2].active, tl.map((t) => t.active));
  await key("1", ["control"]);
  await new Promise((r) => setTimeout(r, 400));
  tl = await tabList();
  check("Ctrl+1 → 첫 탭", tl[0].active, tl.map((t) => t.active));
  await key("W", ["control"]);
  await new Promise((r) => setTimeout(r, 400));
  tl = await tabList();
  check("Ctrl+W → 지금 탭 닫힘, 옆 탭으로", tl.length === 2 && tl[0].active && tl[0].url.includes("ruliweb"), tl);
  // × 로 닫기
  await toolbar.locator("#tabs .tab.active .tab-close").click();
  await new Promise((r) => setTimeout(r, 400));
  tl = await tabList();
  check("× → 탭 닫힘", tl.length === 1 && tl[0].active && tl[0].url.includes("dcinside"), tl);

  // ---------- 탭 끌어서 순서 바꾸기 ----------
  await toolbar.click("#new-tab");
  await go(app, toolbar, BOARD);
  await toolbar.click("#new-tab");
  await go(app, toolbar, "example.com");
  await new Promise((r) => setTimeout(r, 800));
  tl = await tabList();
  const before = tl.map((t) => hostOfUrl(t.url));
  await toolbar.locator("#tabs .tab").nth(0).dragTo(toolbar.locator("#tabs .tab").nth(2), { targetPosition: { x: 150, y: 12 } });
  await new Promise((r) => setTimeout(r, 500));
  tl = await tabList();
  const after = tl.map((t) => hostOfUrl(t.url));
  check("첫 탭을 맨 끝으로 끌어 놓기 → 순서 바뀜", after.join(",") === [before[1], before[2], before[0]].join(","), { before, after });

  // ---------- 북마크 ----------
  await toolbar.locator("#tabs .tab", { hasText: "유게" }).click();
  await new Promise((r) => setTimeout(r, 400));
  await toolbar.click("#bookmark");
  await new Promise((r) => setTimeout(r, 400));
  const bm1 = await toolbar.evaluate(() => ({
    star: document.getElementById("bookmark")!.classList.contains("on"),
    bar: !document.getElementById("bookmark-bar")!.hidden,
    items: Array.from(document.querySelectorAll("#bookmark-bar .bm")).map((b) => b.textContent),
  }));
  check("☆ → 북마크 추가, ★ 표시, 북마크 바에 나타남", bm1.star && bm1.bar && bm1.items.length === 1 && /유게/.test(bm1.items[0] ?? ""), bm1);
  await key("D", ["control"]);
  await new Promise((r) => setTimeout(r, 400));
  const bm2 = await toolbar.evaluate(() => ({ star: document.getElementById("bookmark")!.classList.contains("on"), bar: !document.getElementById("bookmark-bar")!.hidden }));
  check("Ctrl+D → 북마크 해제, 바도 사라짐", !bm2.star && !bm2.bar, bm2);
  await key("D", ["control"]);
  await new Promise((r) => setTimeout(r, 400));
  await key("B", ["control", "shift"]);
  await new Promise((r) => setTimeout(r, 400));
  const barHidden = await toolbar.isHidden("#bookmark-bar");
  await key("B", ["control", "shift"]);
  await new Promise((r) => setTimeout(r, 400));
  check("Ctrl+Shift+B → 북마크 바 숨김/표시", barHidden && (await toolbar.isVisible("#bookmark-bar")));
  // 새 탭(시작 페이지)에 북마크와 최근 방문
  await toolbar.click("#new-tab");
  await new Promise((r) => setTimeout(r, 1200));
  const start = await inPage<{ bookmarks: string[]; recent: number }>(
    app,
    `({ bookmarks: Array.from(document.querySelectorAll("#bookmarks .tile b")).map(b => b.textContent), recent: document.querySelectorAll("#recent .row").length })`,
  );
  check("시작 페이지: 북마크 + 최근 방문", start.bookmarks.length === 1 && start.recent >= 3, start);
  await shot(app, toolbar, "start");

  // ---------- 방문 기록 ----------
  await key("H", ["control"]);
  await new Promise((r) => setTimeout(r, 1200));
  s = await state(app);
  const hist = await inPage<{ rows: number; titles: string[] }>(
    app,
    `({ rows: document.querySelectorAll("#list .row").length, titles: Array.from(document.querySelectorAll("#list .row .text")).map(e => e.textContent) })`,
  );
  check("Ctrl+H → 방문 기록 (제목까지 기록됨)", s.url.endsWith("history.html") && hist.rows >= 3 && hist.titles.some((t) => /프로그래밍/.test(t)), { url: s.url, rows: hist.rows, titles: hist.titles.slice(0, 5) });
  await shot(app, toolbar, "history");
  const filtered = await inPage<number>(
    app,
    `new Promise(res => { const q = document.getElementById("q"); q.value = "Example"; q.dispatchEvent(new Event("input")); setTimeout(() => res(document.querySelectorAll("#list .row").length), 600); })`,
  );
  check("기록 검색", filtered >= 1 && filtered < hist.rows, { filtered, all: hist.rows });
  const afterDel = await inPage<number>(
    app,
    `new Promise(res => { document.querySelector("#list .row .del").click(); setTimeout(() => res(document.querySelectorAll("#list .row").length), 400); })`,
  );
  check("기록 하나 삭제", afterDel === filtered - 1, { before: filtered, after: afterDel });
  // 북마크 바 클릭 → 지금 탭에서 열기
  await toolbar.locator("#bookmark-bar .bm").first().click();
  await new Promise((r) => setTimeout(r, 500));
  s = await waitVerdict(app);
  check("북마크 바 클릭 → 지금 탭에서 그 페이지", s.url.includes("ruliweb") && s.verdict === "ok", { url: s.url });
  await shot(app, toolbar, "tabs");

  await app.close();
}

// ---------- 2. 깨진 레시피 → 원본 + 배너 ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kong-recipes-"));
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "recipes", "bbs.ruliweb.com.json"), "utf8"));
  r.pages[0].title.sel = [".renamed_title"];
  fs.writeFileSync(path.join(dir, "bbs.ruliweb.com.json"), JSON.stringify(r));

  const { app, toolbar } = await launch({ KONG_RECIPES_DIR: dir });
  const s = await go(app, toolbar, POST);
  const rootGone = await inPage<boolean>(app, `!document.getElementById("kong-root")`);
  const bannerShown = await toolbar.isVisible("#banner");
  const viewY = await app.evaluate(() => (globalThis as any).__kong.page.getBounds().y);
  check("깨진 레시피 → 원본 표시 + 배너", s.verdict === "broken" && rootGone && bannerShown, { verdict: s.verdict, failed: s.failed });
  const toolbarH = await toolbar.evaluate(() => document.getElementById("toolbar")!.offsetHeight);
  const bannerH = await toolbar.evaluate(() => document.getElementById("banner")!.offsetHeight);
  check("배너만큼 페이지 영역이 내려감", bannerH > 0 && viewY === toolbarH, { viewY, toolbarH, bannerH });
  const reportFile = path.join(await app.evaluate(({ app }) => app.getPath("userData")), "reports.jsonl");
  const last = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8").trim().split("\n").pop()!) : null;
  check("고장 보고 저장 (콘텐츠 없이, 글 번호 가림)", last?.verdict === "broken" && last.urlPath === "/mobile/board/*/read/*" && !("title" in last), last);
  await shot(app, toolbar, "broken");
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- 3. 설치 파일로 패키징된 앱 (npm run dist 후에만) ----------
const packaged = path.join(ROOT, "release", "win-unpacked", "Kong Browser.exe");
if (fs.existsSync(packaged)) {
  const { app, toolbar } = await launch({}, packaged);
  const s = await go(app, toolbar, BOARD);
  check("패키징된 앱: 내장 레시피로 통일 화면", s.verdict === "ok" && (await app.evaluate(({ app }) => app.isPackaged)), { verdict: s.verdict });
  await app.close();
}

// ---------- 5. 다시 실행하면 탭 복원 ----------
{
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kong-profile-"));
  {
    const { app, toolbar } = await launch({ KONG_USER_DATA: profile });
    await go(app, toolbar, BOARD);
    await toolbar.click("#new-tab");
    await go(app, toolbar, "https://gall.dcinside.com/board/lists/?id=programming");
    await toolbar.locator("#tabs .tab").first().click(); // 첫 탭을 보던 상태로 종료
    await new Promise((r) => setTimeout(r, 1000));
    await app.close();
  }
  const { app } = await launch({ KONG_USER_DATA: profile });
  await new Promise((r) => setTimeout(r, 2500));
  const restored = await app.evaluate(() => (globalThis as any).__kong.tabs as { url: string; active: boolean }[]);
  check(
    "다시 실행 → 탭 2개와 보던 탭 복원",
    restored.length === 2 && restored[0].url.includes("ruliweb") && restored[1].url.includes("dcinside") && restored[0].active,
    restored,
  );
  await app.close();
}

// ---------- 4. 마지막 탭을 닫으면 창이 닫힌다 ----------
{
  const { app, toolbar } = await launch();
  const closed = app.waitForEvent("close", { timeout: 10000 }).then(() => true, () => false);
  await toolbar.locator("#tabs .tab .tab-close").first().click();
  check("마지막 탭 닫기 → 창 닫힘", await closed);
}

console.log(failures ? `\n실패 ${failures}건` : "\n전부 통과");
process.exit(failures ? 1 : 0);
