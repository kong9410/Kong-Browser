// npm run browse -- [url] [--mobile] [--dark]
// 화면이 보이는 개발용 브라우저(기본 PC, --mobile 이면 폰 에뮬레이션)를 열고 모든 페이지에 엔진 + 레시피를 주입한다.
// recipes/*.json 이나 src/ 를 저장하면 다시 빌드해서 현재 페이지를 새로 연다.
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import { buildBundle, flags, injectEngine, launch, loadRecipes, newContext, RECIPES_DIR, ROOT } from "./shared.js";

const url = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "https://bbs.ruliweb.com/community/board/300143";
const opts = flags(process.argv);

const browser = await launch(false);
let ctx: BrowserContext | null = null;
let page: Page | null = null;

async function open(target: string) {
  const bundle = await buildBundle();
  const recipes = loadRecipes();
  // 주입 스크립트는 컨텍스트에 고정되므로, 바뀔 때마다 새 컨텍스트를 만든다
  const old = ctx;
  ctx = await newContext(browser, { ...opts, fitWindow: true });
  await injectEngine(ctx, bundle, recipes);
  page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.text().startsWith("[kong]")) {
      const s = JSON.parse(m.text().slice(7));
      const extra = [...s.failed, ...s.warnings].join(", ");
      console.log(`${s.verdict.padEnd(8)} ${s.pageId ?? "-"} ${s.ms}ms ${page?.url()} ${extra}`);
    }
  });
  page.on("close", () => {
    if (ctx?.pages().length === 0) process.exit(0);
  });
  await page.goto(target, { waitUntil: "domcontentloaded" }).catch((e) => console.error(e.message));
  await old?.close();
}

let timer: ReturnType<typeof setTimeout> | undefined;
const reload = (why: string) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    console.log(`↻ ${why} 변경 → 다시 빌드`);
    await open(page?.url() ?? url).catch((e) => console.error(e.message));
  }, 200);
};
fs.watch(RECIPES_DIR, () => reload("레시피"));
fs.watch(path.join(ROOT, "src"), { recursive: true }, () => reload("엔진"));

console.log("개발 브라우저를 엽니다. 창을 닫으면 종료됩니다.");
await open(url);
