// 인터넷 사용 기록 삭제의 "기간": Electron 은 쿠키·캐시를 기간으로 지우는 기능이 없어서 이렇게 맞춘다
// - 쿠키: 앱이 쿠키가 처음 생긴 시각을 직접 기록해 두고(cookie-times.json), 고른 기간 이후에 생긴 것만 지운다 (Chrome 과 같은 기준).
//   기록을 시작하기 전부터 있던 쿠키는 시각을 모르므로 "전체 기간" 으로만 지운다
// - 캐시·사이트 저장 데이터: 그 기간에 방문한 사이트(방문 기록)의 것만 지운다

/** Electron Cookie 중 쓰는 것만 */
export interface CookieLike {
  name: string;
  domain?: string;
  path?: string;
  secure?: boolean;
}

/** 쿠키 → 처음 생긴 시각 (ms) */
export type CookieTimes = Record<string, number>;

export const cookieKey = (c: CookieLike) => `${c.domain ?? ""}|${c.path ?? "/"}|${c.name}`;

/** 쿠키를 지울 때 쓰는 주소 (도메인 앞의 . 은 뗀다) */
export const cookieUrl = (c: CookieLike) => `${c.secure ? "https" : "http"}://${(c.domain ?? "").replace(/^\./, "")}${c.path ?? "/"}`;

/**
 * 쿠키 바뀜 알림을 기록에 반영 (바꾼 경우에만 true).
 * - 새로 생김: 처음 본 시각 (이미 있으면 그대로 — 값만 바뀐 덮어쓰기는 처음 생긴 시각 유지, Chromium 과 같음)
 * - 덮어쓰기로 잠깐 빠짐(overwrite·expired-overwrite): 곧 다시 들어오므로 그대로
 * - 그 밖의 삭제(만료·직접 삭제·밀려남): 기록에서 뺀다
 */
export function trackCookie(times: CookieTimes, c: CookieLike, cause: string, removed: boolean, now: number): boolean {
  const k = cookieKey(c);
  if (!removed) {
    if (k in times) return false;
    times[k] = now;
    return true;
  }
  if (cause === "overwrite" || cause === "expired-overwrite") return false;
  if (!(k in times)) return false;
  delete times[k];
  return true;
}

/** 이 시각 이후에 생긴 쿠키 (시각을 모르는 쿠키는 빼고) */
export const cookiesSince = <C extends CookieLike>(cookies: C[], times: CookieTimes, since: number): C[] =>
  cookies.filter((c) => (times[cookieKey(c)] ?? -1) >= since);

/** 지금 있는 쿠키만 남긴다 (오래 쓰면 기록이 쌓이지 않게, 시작할 때) */
export function pruneTimes(times: CookieTimes, cookies: CookieLike[]): CookieTimes {
  const live = new Set(cookies.map(cookieKey));
  return Object.fromEntries(Object.entries(times).filter(([k]) => live.has(k)));
}

/** 이 시각 이후 방문한 사이트들 (http(s) origin) */
export function originsSince(history: readonly { url: string; at: number }[], since: number): string[] {
  const out = new Set<string>();
  for (const h of history) {
    if (h.at < since) continue;
    try {
      const u = new URL(h.url);
      if (u.protocol === "http:" || u.protocol === "https:") out.add(u.origin);
    } catch {
      /* 잘못된 주소는 건너뜀 */
    }
  }
  return [...out];
}

export function parseCookieTimes(raw: unknown): CookieTimes {
  const out: CookieTimes = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}
