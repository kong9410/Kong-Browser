// 고장 보고 형식 (설계 7-2절). 앱(데스크톱/안드로이드)과 카나리가 같은 형식을 쓴다.
// 콘텐츠(제목, 본문, HTML)는 절대 넣지 않는다. URL 도 글 번호 같은 숫자는 * 로 지운다.
import type { Status } from "./recipe.js";

export interface Report {
  host: string;
  recipeVersion: number | null;
  pageId: string | null;
  verdict: Status["verdict"];
  failed: string[];
  warnings: string[];
  /** 글 번호 등 숫자를 * 로 바꾼 경로 */
  urlPath: string;
  engine: number;
  app: string;
  at: string;
}

/** /board/300143/read/77261288?page=2 → /board/*\/read/*?page=* */
export function maskPath(url: string): string {
  try {
    const u = new URL(url);
    const q = Array.from(u.searchParams.keys())
      .map((k) => `${k}=*`)
      .join("&");
    return u.pathname.replace(/\d+/g, "*") + (q ? `?${q}` : "");
  } catch {
    return "";
  }
}

export function toReport(status: Status, url: string, app: string): Report {
  return {
    host: status.host,
    recipeVersion: status.recipeVersion,
    pageId: status.pageId,
    verdict: status.verdict,
    failed: status.failed,
    warnings: status.warnings,
    urlPath: maskPath(url),
    engine: status.engine,
    app,
    at: new Date().toISOString(),
  };
}

/** 보고할 가치가 있는지: 정상(ok)과 레시피 없음(none)은 보내지 않는다 */
export const shouldReport = (s: Status) => s.verdict === "broken" || s.verdict === "degraded";

/** 같은 레시피·같은 실패는 기기당 1시간에 1번만 (설계 7-2절) */
export function dedupeKey(r: Report): string {
  return [r.host, r.recipeVersion, r.pageId, r.verdict, ...r.failed, ...r.warnings].join("|");
}
export const DEDUPE_MS = 60 * 60 * 1000;
