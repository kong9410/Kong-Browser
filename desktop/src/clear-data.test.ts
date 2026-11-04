import { describe, expect, it } from "vitest";
import { cookieKey, cookiesSince, cookieUrl, originsSince, parseCookieTimes, pruneTimes, trackCookie, type CookieTimes } from "./clear-data";

const sid = { name: "sid", domain: ".dcinside.com", path: "/", secure: true };
const pref = { name: "pref", domain: "bbs.ruliweb.com", path: "/", secure: false };

describe("쿠키 생긴 시각 기록", () => {
  it("처음 생긴 시각을 기록하고, 값만 바뀐 덮어쓰기는 처음 시각을 유지", () => {
    const t: CookieTimes = {};
    expect(trackCookie(t, sid, "explicit", false, 100)).toBe(true);
    // 덮어쓰기: 빠졌다가(overwrite) 다시 들어옴
    expect(trackCookie(t, sid, "overwrite", true, 200)).toBe(false);
    expect(trackCookie(t, sid, "explicit", false, 200)).toBe(false);
    expect(t[cookieKey(sid)]).toBe(100);
  });

  it("만료·삭제되면 기록에서 빠지고, 다시 생기면 새 시각", () => {
    const t: CookieTimes = {};
    trackCookie(t, sid, "explicit", false, 100);
    expect(trackCookie(t, sid, "expired", true, 150)).toBe(true);
    expect(cookieKey(sid) in t).toBe(false);
    trackCookie(t, sid, "explicit", false, 300);
    expect(t[cookieKey(sid)]).toBe(300);
  });

  it("기간 이후에 생긴 쿠키만 고른다 (시각을 모르는 예전 쿠키는 빼고)", () => {
    const t: CookieTimes = { [cookieKey(sid)]: 1000 };
    expect(cookiesSince([sid, pref], t, 500)).toEqual([sid]);
    expect(cookiesSince([sid, pref], t, 2000)).toEqual([]);
  });

  it("지울 주소, 오래된 기록 정리, 파일 읽기", () => {
    expect(cookieUrl(sid)).toBe("https://dcinside.com/");
    expect(cookieUrl(pref)).toBe("http://bbs.ruliweb.com/");
    expect(pruneTimes({ [cookieKey(sid)]: 1, gone: 2 }, [sid])).toEqual({ [cookieKey(sid)]: 1 });
    expect(parseCookieTimes({ a: 1, b: "x", c: null })).toEqual({ a: 1 });
  });
});

describe("기간 안에 방문한 사이트", () => {
  it("방문 기록에서 origin 만 겹치지 않게", () => {
    const h = [
      { url: "https://gall.dcinside.com/board/lists/?id=a", at: 900 },
      { url: "https://gall.dcinside.com/board/view/?id=a&no=1", at: 950 },
      { url: "https://bbs.ruliweb.com/best", at: 100 },
      { url: "file:///C:/app/ui/start.html", at: 990 },
    ];
    expect(originsSince(h, 500)).toEqual(["https://gall.dcinside.com"]);
    expect(originsSince(h, 0).sort()).toEqual(["https://bbs.ruliweb.com", "https://gall.dcinside.com"]);
  });
});
