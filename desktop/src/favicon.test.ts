import { describe, expect, it } from "vitest";
import { iconFor } from "./favicon";

describe("탭 아이콘", () => {
  it("페이지가 알려준 favicon 을 쓴다", () => {
    expect(iconFor("https://bbs.ruliweb.com/x", "https://img.ruliweb.com/fav.ico")).toEqual({ src: "https://img.ruliweb.com/fav.ico", fallback: "page" });
  });
  it("알려준 게 없으면 그 사이트의 /favicon.ico (없으면 화면에서 기본 아이콘)", () => {
    expect(iconFor("https://example.com/a/b?c=1", null)).toEqual({ src: "https://example.com/favicon.ico", fallback: "page" });
  });
  it("앱 안쪽 페이지는 앱 아이콘", () => {
    expect(iconFor("file:///C:/app/dist/ui/start.html", null)).toEqual({ builtin: "home" });
    expect(iconFor("file:///C:/app/dist/ui/history.html", null)).toEqual({ builtin: "history" });
    expect(iconFor("file:///C:/app/dist/ui/bookmarks.html", "x")).toEqual({ builtin: "bookmarks" });
  });
  it("주소가 없거나 웹 주소가 아니면 기본 아이콘", () => {
    expect(iconFor("", null)).toEqual({ builtin: "page" });
    expect(iconFor("about:blank", null)).toEqual({ builtin: "page" });
  });
});
