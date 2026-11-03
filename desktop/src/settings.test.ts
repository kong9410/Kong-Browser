import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("설정", () => {
  it("파일이 없거나 깨졌으면 기본값 (모두 켜짐)", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual({ navOpen: true, bookmarkBar: true, dockOpen: true });
  });
  it("예전 파일에 없던 dockOpen 은 기본값(표시), 있던 값은 그대로", () => {
    expect(parseSettings({ navOpen: false, bookmarkBar: false })).toEqual({ navOpen: false, bookmarkBar: false, dockOpen: true });
  });
  it("dock 을 숨긴 상태를 기억", () => {
    expect(parseSettings({ dockOpen: false }).dockOpen).toBe(false);
  });
  it("모르는 항목이나 잘못된 형식은 무시", () => {
    expect(parseSettings({ dockOpen: "no", extra: 1 })).toEqual(DEFAULT_SETTINGS);
  });
});
