import { describe, expect, it } from "vitest";
import { contextItems } from "./context-menu";
import { searchUrl } from "./search-engines";
import { DEFAULT_SETTINGS, isSettingKey, parseSettings, validSetting } from "./settings";
import { suggest, toUrl } from "./suggest";

describe("설정 값", () => {
  it("새 항목의 기본값: 지난번 탭 복원, Google, 운영체제 다운로드 폴더, 묻지 않음", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ startup: "restore", searchEngine: "google", downloadDir: null, askDownload: false });
  });

  it("이상한 값은 기본값으로, 올바른 값은 그대로", () => {
    const s = parseSettings({ startup: "home", searchEngine: "naver", downloadDir: "D:\\받은 파일", askDownload: true, bookmarkBar: "yes" });
    expect(s).toMatchObject({ startup: "home", searchEngine: "naver", downloadDir: "D:\\받은 파일", askDownload: true, bookmarkBar: true });
    expect(parseSettings({ startup: "later", searchEngine: "yahoo", downloadDir: "  " })).toMatchObject({ startup: "restore", searchEngine: "google", downloadDir: null });
  });

  it("설정 페이지에서 온 값 확인", () => {
    expect(isSettingKey("searchEngine")).toBe(true);
    expect(isSettingKey("__proto__")).toBe(false);
    expect(validSetting("searchEngine", "daum")).toBe(true);
    expect(validSetting("searchEngine", "x")).toBe(false);
    expect(validSetting("downloadDir", null)).toBe(true);
    expect(validSetting("askDownload", "true")).toBe(false);
  });
});

describe("검색 엔진", () => {
  it("주소가 아닌 말은 고른 검색 엔진으로", () => {
    expect(toUrl("루리웹 유머", "naver")).toBe("https://search.naver.com/search.naver?query=" + encodeURIComponent("루리웹 유머"));
    expect(toUrl("ruliweb.com", "naver")).toBe("https://ruliweb.com");
    expect(searchUrl("daum", "a b")).toBe("https://search.daum.net/search?q=a%20b");
  });

  it("자동완성 첫 줄과 오른쪽 클릭 메뉴에 검색 엔진 이름", () => {
    expect(suggest("고양이", { bookmarks: [], history: [] }, { engine: "naver" })[0].title).toBe("고양이 - 네이버 검색");
    const items = contextItems({
      linkURL: "",
      srcURL: "",
      mediaType: "none",
      selectionText: "고양이",
      isEditable: false,
      editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true },
      canGoBack: false,
      canGoForward: false,
      searchName: "네이버",
    });
    expect(items[1]).toMatchObject({ label: '네이버 에서 "고양이" 검색' });
  });
});
