// npm run diagnose -- <url> [--mobile] [--dark]
// 1) 원본 페이지에서 레시피의 각 필드가 무엇을 찾았는지 표로 출력 (DOM 변경 없음)
// 2) 실제 재배치를 실행해 판정 결과와 원본/재배치 스크린샷을 out/ 에 저장
import fs from "node:fs";
import path from "node:path";
import { buildBundle, flags, injectEngine, launch, newContext, OUT_DIR, recipeFor } from "./shared.js";

const url = process.argv.slice(2).find((a) => !a.startsWith("--"));
const opts = flags(process.argv);
if (!url) {
  console.error("사용법: npm run diagnose -- <url> [--mobile] [--dark]");
  process.exit(1);
}
const recipe = recipeFor(url);
if (!recipe) {
  console.error(`레시피 없음: ${new URL(url).host} (recipes/ 에 <host>.json 을 만드세요)`);
  process.exit(1);
}

const bundle = await buildBundle();
const browser = await launch(true);
fs.mkdirSync(OUT_DIR, { recursive: true });
const shot = (name: string) => path.join(OUT_DIR, `${new URL(url).host}-${name}.png`);

try {
  // 1) 원본 + 진단 (boot 없이 엔진만 넣음)
  const ctxA = await newContext(browser, opts);
  await injectEngine(ctxA, bundle, null);
  const a = await ctxA.newPage();
  await a.goto(url, { waitUntil: "domcontentloaded" });
  await a.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const report = await a.evaluate((r) => window.kong!.inspect(r as any), recipe as any);
  await a.screenshot({ path: shot("original") });
  await ctxA.close();

  console.log(`\n■ ${url}\n  레시피 ${recipe.host} v${recipe.version}`);
  console.log(JSON.stringify(report, null, 2));

  // 2) 재배치 실행 (앱과 동일한 주입 방식)
  const ctxB = await newContext(browser, opts);
  await injectEngine(ctxB, bundle, [recipe]);
  const b = await ctxB.newPage();
  const errors: string[] = [];
  b.on("pageerror", (e) => errors.push(e.message));
  await b.goto(url, { waitUntil: "domcontentloaded" });
  await b.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const status = await b.evaluate(() => window.__kongStatus ?? null);
  await b.screenshot({ path: shot("kong"), fullPage: true });
  await ctxB.close();

  console.log(`\n■ 재배치 결과: ${status?.verdict ?? "(실행 안 됨)"} (${status?.ms ?? "-"}ms)`);
  if (status?.failed.length) console.log(`  실패: ${status.failed.join(", ")}`);
  if (status?.warnings.length) console.log(`  경고: ${status.warnings.join(", ")}`);
  if (errors.length) console.log(`  페이지 JS 오류 ${errors.length}건: ${errors.slice(0, 3).join(" | ")}`);
  console.log(`  스크린샷: ${shot("original")}\n            ${shot("kong")}`);
} finally {
  await browser.close();
}
