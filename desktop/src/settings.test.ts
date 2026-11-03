import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("설정", () => {
  it("파일이 없거나 깨졌으면 기본값 (메뉴·북마크 바·dock 표시, 통합 화면)", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual({ navOpen: true, bookmarkBar: true, dockOpen: true, original: false });
  });
  it("예전 파일에 없던 항목은 기본값, 있던 값은 그대로", () => {
    expect(parseSettings({ navOpen: false, bookmarkBar: false })).toEqual({ navOpen: false, bookmarkBar: false, dockOpen: true, original: false });
  });
  it("원본 보기 토글을 기억", () => {
    expect(parseSettings({ original: true }).original).toBe(true);
  });
  it("dock 을 숨긴 상태를 기억", () => {
    expect(parseSettings({ dockOpen: false }).dockOpen).toBe(false);
  });
  it("모르는 항목이나 잘못된 형식은 무시", () => {
    expect(parseSettings({ dockOpen: "no", extra: 1 })).toEqual(DEFAULT_SETTINGS);
  });
});
