// 회귀 검사: 저장해 둔 스냅샷 전부에 현재 레시피를 돌려 판정한다. 네트워크 없이, 사이트 JS 없이 실행.
// 레시피를 고친 뒤 "다른 글에서 깨지지 않았는지" 확인하는 용도.
//   npm run check            모든 사이트
//   npm run check -- <host>  한 사이트
import fs from "node:fs";
import path from "node:path";
import { buildBundle, injectEngine, launch, loadRecipes, newContext, SNAP_DIR } from "./shared.js";
import type { Recipe } from "../src/recipe.js";

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const recipes = loadRecipes().filter((r) => !only || r.host === only);
if (!fs.existsSync(SNAP_DIR)) {
  console.error("스냅샷이 없습니다. 먼저 npm run snapshot -- --board <목록url> 로 모으세요.");
  process.exit(1);
}

const browser = await launch(true);
const ctx = await newContext(browser);
await injectEngine(ctx, await buildBundle(), null);
const page = await ctx.newPage();
let bad = 0;
let total = 0;

for (const recipe of recipes) {
  const dir = path.join(SNAP_DIR, recipe.host);
  if (!fs.existsSync(dir)) continue;
  const snaps = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  console.log(`\n■ ${recipe.host} v${recipe.version} — 스냅샷 ${snaps.length}개`);
  for (const meta of snaps) {
    const { url } = JSON.parse(fs.readFileSync(path.join(dir, meta), "utf8"));
    // 사이트 스크립트는 지우고, 원래 URL 에서 스냅샷 HTML 이 열리게 한다 (나머지 요청은 전부 차단)
    const html = fs.readFileSync(path.join(dir, meta.replace(/\.json$/, ".html")), "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, "");
    await page.unroute("**/*");
    await page.route("**/*", (route) =>
      route.request().url() === url && route.request().resourceType() === "document"
        ? route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html })
        : route.abort(),
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const r = (await page.evaluate((rc) => window.kong!.inspect(rc as Recipe), recipe as unknown)) as any;
    const v = r.judgement?.verdict ?? "broken";
    const why = [...(r.judgement?.failed ?? []), ...(r.judgement?.warnings ?? [])];
    total++;
    if (v === "broken" || !r.page) bad++;
    const mark = v === "ok" ? "✔" : v === "degraded" ? "△" : "✘";
    console.log(`  ${mark} ${v.padEnd(8)} ${meta.replace(/\.json$/, "").padEnd(22)} ${why.join(", ")}`);
  }
}
await browser.close();
console.log(`\n${total}개 중 실패 ${bad}개`);
process.exit(bad ? 1 : 0);
