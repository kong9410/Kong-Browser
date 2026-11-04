import { describe, expect, it } from "vitest";
import { FRESH_MS, isFresh, sameTabLink } from "./leave-dialog";

const click = { button: 0, ctrlKey: false, shiftKey: false, metaKey: false, altKey: false };

describe("나가기 확인: 막혔던 이동 고르기", () => {
  it("막히기 직전에 시작한 이동만 다시 한다", () => {
    expect(isFresh(1000, 1000)).toBe(true);
    expect(isFresh(1000, 1000 + FRESH_MS)).toBe(true);
    expect(isFresh(1000, 1001 + FRESH_MS)).toBe(false);
    expect(isFresh(undefined, 1000)).toBe(false);
    expect(isFresh(2000, 1000)).toBe(false);
  });

  it("같은 탭에서 여는 보통 링크 클릭만 기억한다", () => {
    expect(sameTabLink("https://gall.dcinside.com/board/lists/?id=a", "", click)).toBe(true);
    expect(sameTabLink("https://bbs.ruliweb.com/best", "_self", click)).toBe(true);
    expect(sameTabLink("https://a.com/", "_blank", click)).toBe(false);
    expect(sameTabLink("https://a.com/", "", { ...click, ctrlKey: true })).toBe(false);
    expect(sameTabLink("https://a.com/", "", { ...click, button: 1 })).toBe(false);
    expect(sameTabLink("javascript:void(0)", "", click)).toBe(false);
  });
});
