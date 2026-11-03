// dist/ 로 빌드: main, preload 2개(엔진은 preload-page 에 번들), 툴바, 시작 페이지, 레시피 복사
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const RECIPES = path.resolve(ROOT, "..", "recipes");

fs.rmSync(DIST, { recursive: true, force: true });

const common: esbuild.BuildOptions = { bundle: true, logLevel: "warning", sourcemap: "linked" };

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [path.join(SRC, "main.ts")],
    outfile: path.join(DIST, "main.js"),
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  // sandbox 된 preload 는 require("electron") 외에는 모듈을 불러올 수 없으므로 한 파일로 묶는다
  ...["preload-page", "preload-ui", "preload-suggest"].map((name) =>
    esbuild.build({
      ...common,
      entryPoints: [path.join(SRC, `${name}.ts`)],
      outfile: path.join(DIST, `${name}.js`),
      platform: "browser",
      format: "cjs",
      target: "chrome130",
      external: ["electron"],
      loader: { ".css": "text" },
    }),
  ),
  // 툴바와 앱 안쪽 페이지(시작 페이지, 방문 기록)의 스크립트
  ...["toolbar", "start", "history", "bookmarks", "suggest-list"].map((name) =>
    esbuild.build({
      ...common,
      entryPoints: [path.join(SRC, "ui", `${name}.ts`)],
      outfile: path.join(DIST, "ui", `${name}.js`),
      platform: "browser",
      format: "iife",
      target: "chrome130",
    }),
  ),
]);

for (const f of ["index.html", "toolbar.css", "start.html", "history.html", "bookmarks.html", "suggest.html", "pages.css"]) fs.copyFileSync(path.join(SRC, "ui", f), path.join(DIST, "ui", f));

fs.mkdirSync(path.join(DIST, "recipes"), { recursive: true });
const recipes = fs.readdirSync(RECIPES).filter((f) => f.endsWith(".json"));
for (const f of recipes) fs.copyFileSync(path.join(RECIPES, f), path.join(DIST, "recipes", f));

console.log(`dist/ 빌드 완료 (레시피 ${recipes.length}개: ${recipes.join(", ")})`);
