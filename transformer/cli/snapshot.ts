// 회귀 테스트용 스냅샷 수집. 판정이 ok 인 페이지의 렌더링된 HTML 을 개발 PC 에만 저장한다 (서버에 올리지 않음).
//   npm run snapshot -- <url>                      글/목록 하나
//   npm run snapshot -- --board <목록url> [--count 10]   목록 + 그 목록의 최신 글 N개
import fs from "node:fs";
import path from "node:path";
import { buildBundle, flags, injectEngine, launch, newContext, openPage, recipeFor, SNAP_DIR } from "./shared.js";
import type { Recipe } from "../src/recipe.js";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const board = opt("--board");
const count = Number(opt("--count") ?? 10);
const single = args.find((a, i) => !a.startsWith("--") && !["--board", "--count"].includes(args[i - 1] ?? ""));
const target = board ?? single;
if (!target) {
  console.error("사용법: npm run snapshot -- <url>  또는  npm run snapshot -- --board <목록url> [--count 10]");
  process.exit(1);
}
const recipe = recipeFor(target);
if (!recipe) {
  console.error(`레시피 없음: ${new URL(target).host}`);
  process.exit(1);
}

const browser = await launch(true);
const ctx = await newContext(browser, flags(process.argv));
await injectEngine(ctx, await buildBundle(), null); // 재배치 없이 원본 + 진단만
const page = await ctx.newPage();
const dir = path.join(SNAP_DIR, recipe.host);
fs.mkdirSync(dir, { recursive: true });

async function save(url: string): Promise<string[]> {
  await openPage(page, url);
  const r = (await page.evaluate((rc) => window.kong!.inspect(rc as Recipe), recipe as unknown)) as any;
  const verdict = r.judgement?.verdict ?? "none";
  // 파일 이름: 글 번호(no=) → 게시판 id(id=) → 경로 끝 숫자 순으로
  const u = new URL(url);
  const key = u.searchParams.get("no") ?? u.searchParams.get("id") ?? url.match(/(\d+)\D*$/)?.[1] ?? String(Date.now());
  const name = `${r.page ?? "unknown"}-${key}`;
  if (verdict !== "ok") {
    console.log(`건너뜀  ${verdict.padEnd(8)} ${url}  [${[...(r.judgement?.failed ?? []), ...(r.judgement?.warnings ?? [])]}]`);
  } else {
    fs.writeFileSync(path.join(dir, `${name}.html`), await page.content());
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ url, savedAt: new Date().toISOString(), pageId: r.page }, null, 2));
    console.log(`저장    ${name}  ${url}`);
  }
  return r.hrefs ?? [];
}

try {
  const hrefs = await save(target);
  if (board) for (const href of hrefs.slice(0, count)) await save(href);
} finally {
  await browser.close();
}
console.log(`\n${dir} 에 ${fs.readdirSync(dir).filter((f) => f.endsWith(".html")).length}개`);
