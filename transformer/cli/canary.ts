// 카나리 점검 (설계 7-1절): 사용자보다 먼저 사이트 변경을 알아채기 위해, canary.json 의 게시판과 최신 글을
// 실제로 열어 재배치 판정을 모은다. 결과는 out/canary-<시각>.json (보고 형식은 앱과 동일), broken 이 있으면 종료 코드 1.
//   npm run canary
// 서버(클라우드) IP 는 커뮤니티에 막히기 쉬우므로 개발 PC 에서 돌린다 (Windows 작업 스케줄러 등록 방법은 README).
import fs from "node:fs";
import path from "node:path";
import { toReport } from "../src/report.js";
import type { Recipe, Status } from "../src/recipe.js";
import { buildBundle, injectEngine, lastStatus, launch, loadRecipes, newContext, openPage, OUT_DIR, ROOT } from "./shared.js";

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "canary.json"), "utf8")) as { posts: number; boards: string[] };
const recipes = loadRecipes();
const bundle = await buildBundle();
const browser = await launch(true);
const results: { url: string; status: Status | null }[] = [];

for (const board of config.boards) {
  const recipe = recipes.find((r) => r.host === new URL(board).host);
  if (!recipe) {
    console.log(`레시피 없음: ${board}`);
    continue;
  }
  const mobile = board.includes("//m.");
  const ctx = await newContext(browser, { mobile });
  // 목록에서 글 링크를 얻기 위한 진단용 페이지 (재배치 없음)
  const probeCtx = await newContext(browser, { mobile });
  await injectEngine(ctx, bundle, [recipe]);
  await injectEngine(probeCtx, bundle, null);
  const page = await ctx.newPage();
  const probe = await probeCtx.newPage();

  console.log(`\n■ ${board}`);
  const visit = async (url: string) => {
    let status: Status | null = null;
    try {
      await openPage(page, url);
      status = await lastStatus(page);
    } catch (e) {
      console.log(`  ✘ 열기 실패 ${url}: ${(e as Error).message.split("\n")[0]}`);
    }
    results.push({ url, status });
    const v = status?.verdict ?? "error";
    const mark = v === "ok" ? "✔" : v === "degraded" ? "△" : "✘";
    console.log(`  ${mark} ${v.padEnd(8)} ${status?.pageId ?? "-"} ${url}  ${[...(status?.failed ?? []), ...(status?.warnings ?? [])].join(", ")}`);
  };

  await visit(board);
  await openPage(probe, board);
  const info = (await probe.evaluate((rc) => window.kong!.inspect(rc as Recipe), recipe as unknown)) as { hrefs?: string[] };
  for (const href of (info.hrefs ?? []).slice(0, config.posts)) await visit(href);
  await ctx.close();
  await probeCtx.close();
}
await browser.close();

const reports = results.filter((r) => r.status).map((r) => toReport(r.status!, r.url, "canary"));
const broken = results.filter((r) => !r.status || r.status.verdict === "broken");
const degraded = results.filter((r) => r.status?.verdict === "degraded");
fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `canary-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), checked: results.length, broken: broken.length, degraded: degraded.length, reports }, null, 2));

console.log(`\n${results.length}개 점검: 정상 ${results.length - broken.length - degraded.length}, 일부 누락 ${degraded.length}, 고장 ${broken.length}`);
console.log(`결과: ${file}`);
// 알림 채널(Discord/Telegram/이메일)은 M4 에서 서버와 함께 정한다. 지금은 종료 코드로 알 수 있다.
process.exit(broken.length ? 1 : 0);
