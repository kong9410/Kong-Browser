// CLI 공통: 엔진 번들 빌드, 레시피 로드, 모바일 에뮬레이션 브라우저 준비
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { Recipe } from "../src/recipe.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export const RECIPES_DIR = path.resolve(ROOT, "..", "recipes");
export const DIST = path.join(ROOT, "dist", "transformer.js");
export const OUT_DIR = path.join(ROOT, "out");

/** 앱(WebView)과 개발 도구가 똑같이 쓰는 단일 파일 번들을 만든다 */
export async function buildBundle(): Promise<string> {
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src", "index.ts")],
    bundle: true,
    format: "iife",
    target: "es2019", // 구형 Android WebView 고려
    loader: { ".css": "text" },
    minify: false,
    outfile: DIST,
    logLevel: "warning",
  });
  return fs.readFileSync(DIST, "utf8");
}

export function loadRecipes(): Recipe[] {
  return fs
    .readdirSync(RECIPES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, f), "utf8")) as Recipe);
}

export function recipeFor(url: string): Recipe | undefined {
  return loadRecipes().find((r) => r.host === new URL(url).host);
}

export async function launch(headless: boolean): Promise<Browser> {
  return chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless });
}

export interface ContextOptions {
  /** 폰과 같은 조건(모바일 UA, 화면 크기, 터치). 기본은 PC */
  mobile?: boolean;
  dark?: boolean;
  /** 화면이 보이는 창에서는 창 크기를 그대로 따라가게 (PC 전용) */
  fitWindow?: boolean;
}

export async function newContext(browser: Browser, o: ContextOptions = {}): Promise<BrowserContext> {
  const colorScheme = o.dark ? "dark" : "light";
  if (o.mobile) return browser.newContext({ ...devices["Pixel 7"], locale: "ko-KR", colorScheme });
  return browser.newContext({ viewport: o.fitWindow ? null : { width: 1280, height: 900 }, locale: "ko-KR", colorScheme });
}

/** 명령행 공통 플래그: --mobile, --dark */
export const flags = (argv: string[]): ContextOptions => ({ mobile: argv.includes("--mobile"), dark: argv.includes("--dark") });

export const SNAP_DIR = path.join(ROOT, "snapshots");

/** 페이지 로드 + 늦게 붙는 요소(AJAX 댓글 등)를 조금 더 기다림 */
export async function openPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/** 엔진이 마지막으로 보고한 판정 (늦은 검산으로 바뀐 것까지 반영) */
export const lastStatus = (page: Page) => page.evaluate(() => window.__kongStatus ?? null);

/** 앱이 하는 것과 똑같이: document-start 에 엔진 + kong.boot(레시피) 주입 */
export async function injectEngine(ctx: BrowserContext, bundle: string, recipes: Recipe[] | null) {
  const boot = recipes ? `\n;window.kong && window.kong.boot(${JSON.stringify(recipes)});` : "";
  await ctx.addInitScript({ content: bundle + boot });
}
