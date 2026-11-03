// 주소창 자동완성: 입력한 글자로 북마크와 방문 기록에서 후보를 고르고 순위를 매긴다 (Electron 없는 순수 함수)

export const SEARCH_URL = "https://www.google.com/search?q=";

/** 주소처럼 보이는지: 스킴이 있거나, 공백 없이 점이 들어간 이름, 또는 localhost */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(t) || /^localhost(:\d+)?(\/.*)?$/.test(t);
}

/** 주소창 입력 → URL. 주소처럼 보이지 않으면 검색 */
export function toUrl(text: string): string {
  const t = text.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (looksLikeUrl(t)) return `https://${t}`;
  return SEARCH_URL + encodeURIComponent(t);
}

/** 비교용 주소: 스킴, www., 끝의 / 를 뗀다 (https://www.a.com/ → a.com) */
export const bareUrl = (url: string) =>
  url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "")
    .toLowerCase();

export interface Suggestion {
  /** go = 입력한 주소로, search = 검색, bookmark/history = 후보 */
  kind: "go" | "search" | "bookmark" | "history";
  title: string;
  url: string;
  /** 북마크가 들어 있는 폴더 이름 (있으면) */
  folder?: string;
}

export interface SuggestSource {
  bookmarks: readonly { url: string; title: string; folder?: string | null }[];
  history: readonly { url: string; title: string; at: number }[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 첫 줄은 항상 "입력한 그대로" (주소면 이동, 아니면 검색), 그 아래 후보 limit 개.
 * - 입력을 공백으로 나눈 모든 낱말이 주소나, 그 페이지가 불린 이름(북마크 제목, 방문 기록 제목, 폴더 이름) 중에 들어 있어야 후보
 * - 점수: 북마크 +100, 주소가 입력으로 시작 +50 (예: "rul" → ruliweb.com), 주소의 일부(경로 앞)가 입력으로 시작 +30,
 *   제목이 입력으로 시작 +10, 방문 횟수 ×3 (최대 30), 최근 방문일수록 최대 +20
 * - 같은 주소는 하나로 (북마크면 북마크로)
 */
export function suggest(text: string, src: SuggestSource, opts: { limit?: number; now?: number } = {}): Suggestion[] {
  const input = text.trim();
  if (!input) return [];
  const limit = opts.limit ?? 6;
  const now = opts.now ?? Date.now();
  const q = input.toLowerCase();
  const words = q.split(/\s+/);

  const typed: Suggestion = looksLikeUrl(input)
    ? { kind: "go", title: input, url: toUrl(input) }
    : { kind: "search", title: `${input} - Google 검색`, url: toUrl(input) };

  // 주소마다 하나로 모은다
  interface Cand {
    url: string;
    title: string;
    folder?: string;
    bookmark: boolean;
    visits: number;
    lastAt: number;
    /** 검색에 쓰는 이름들: 표시 제목이 북마크 제목으로 바뀌어도 기록의 제목으로 찾을 수 있게 */
    names: Set<string>;
  }
  const byUrl = new Map<string, Cand>();
  const get = (url: string, title: string) => {
    const key = bareUrl(url);
    let c = byUrl.get(key);
    if (!c) {
      c = { url, title, bookmark: false, visits: 0, lastAt: 0, names: new Set() };
      byUrl.set(key, c);
    }
    return c;
  };
  for (const h of src.history) {
    const c = get(h.url, h.title);
    c.visits++;
    if (h.title && h.title !== h.url) c.names.add(h.title.toLowerCase());
    if (h.at > c.lastAt) {
      c.lastAt = h.at;
      // 제목은 가장 최근 방문의 것 (주소만 기록된 경우는 건너뜀)
      if (h.title && h.title !== h.url) c.title = h.title;
    }
  }
  for (const b of src.bookmarks) {
    const c = get(b.url, b.title);
    c.bookmark = true;
    c.title = b.title || c.title;
    c.url = b.url;
    if (b.folder) c.folder = b.folder;
    c.names.add(b.title.toLowerCase());
    if (b.folder) c.names.add(b.folder.toLowerCase());
  }

  const typedKey = bareUrl(typed.url);
  const scored: { c: Cand; score: number }[] = [];
  for (const [key, c] of byUrl) {
    if (key === typedKey) continue; // 첫 줄과 같은 주소
    const title = c.title.toLowerCase();
    const hay = [title, key, ...c.names].join(" ");
    if (!words.every((w) => hay.includes(w))) continue;
    let score = c.bookmark ? 100 : 0;
    if (key.startsWith(q)) score += 50;
    else if (key.split(/[./?=&]/).some((part) => part.startsWith(q))) score += 30;
    if (title.startsWith(q)) score += 10;
    score += Math.min(c.visits * 3, 30);
    if (c.lastAt) score += Math.max(0, 20 - Math.floor((now - c.lastAt) / DAY));
    scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score || b.c.lastAt - a.c.lastAt);

  return [
    typed,
    ...scored.slice(0, limit).map(({ c }) => ({
      kind: c.bookmark ? ("bookmark" as const) : ("history" as const),
      title: c.title || c.url,
      url: c.url,
      ...(c.folder ? { folder: c.folder } : {}),
    })),
  ];
}
