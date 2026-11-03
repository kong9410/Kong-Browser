// 읽은 글 표시: 앱의 방문 기록으로 목록에서 이미 본 글의 제목 색을 바꾼다.
// (Electron 은 링크의 :visited 를 지원하지 않아서 사이트 원래 기능처럼 직접 한다)

/**
 * 같은 글인지 비교하는 열쇠: 주소 경로 + 글을 가리키는 쿼리 값만.
 * params 가 없으면 경로만 (루리웹 /board/300143/read/123?page=2 → 경로), 있으면 그 값만 (디시 ?id=…&no=…, page 등은 무시)
 */
export function visitKey(url: string, params?: string[]): string | null {
  let u: URL;
  try {
    u = new URL(url, location.href);
  } catch {
    return null;
  }
  const path = u.pathname.replace(/\/+$/, "");
  const kept = (params ?? []).map((p) => `${p}=${u.searchParams.get(p) ?? ""}`).join("&");
  return `${u.host}${path}${kept ? "?" + kept : ""}`;
}

let visitedUrls: string[] = [];
const keySets = new Map<string, Set<string>>();

/** 앱이 넘겨준 방문 기록 (이 사이트 것) */
export function setVisited(urls: string[]) {
  visitedUrls = urls;
  keySets.clear();
}

export function isVisited(href: string, params?: string[]): boolean {
  const sig = (params ?? []).join(",");
  let set = keySets.get(sig);
  if (!set) {
    set = new Set(visitedUrls.map((u) => visitKey(u, params)).filter((k): k is string => !!k));
    keySets.set(sig, set);
  }
  const k = visitKey(href, params);
  return !!k && set.has(k);
}

/** 목록에서 누른 글은 바로 읽은 글로 (돌아왔을 때 페이지가 캐시에서 살아난 경우에도 표시되도록) */
export function markVisited(href: string) {
  visitedUrls.push(href);
  keySets.clear();
}
