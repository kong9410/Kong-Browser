import { describe, expect, it } from "vitest";
import { DOCK_SITES, dockSiteOf, faviconOf, openTarget } from "./dock";

describe("dock 사이트 목록", () => {
  it("주요 커뮤니티 15곳, 이름·도메인이 겹치지 않고 모두 https", () => {
    expect(DOCK_SITES).toHaveLength(15);
    expect(new Set(DOCK_SITES.map((s) => s.name)).size).toBe(15);
    expect(new Set(DOCK_SITES.map((s) => s.domain)).size).toBe(15);
    for (const s of DOCK_SITES) {
      expect(s.url).toMatch(/^https:\/\//);
      // 대표 주소가 자기 도메인 안에 있어야 강조가 맞는다
      expect(dockSiteOf(s.url)?.name).toBe(s.name);
    }
  });

  it("하위 도메인도 같은 사이트 (bbs./m./gall.)", () => {
    expect(dockSiteOf("https://m.ruliweb.com/community/board/300143")?.name).toBe("루리웹");
    expect(dockSiteOf("https://gall.dcinside.com/board/lists/?id=programming")?.name).toBe("디시인사이드");
  });

  it("비슷한 이름의 다른 도메인은 아님", () => {
    expect(dockSiteOf("https://notruliweb.com/")).toBeNull();
    expect(dockSiteOf("https://www.donga.com/")).toBeNull();
  });

  it("주소가 아니면 null", () => expect(dockSiteOf("file:///C:/app/ui/start.html")).toBeNull());

  it("아이콘은 사이트의 /favicon.ico", () => {
    expect(faviconOf(DOCK_SITES[0])).toBe("https://bbs.ruliweb.com/favicon.ico");
  });

  it("그냥 클릭 = 지금 탭, Ctrl+클릭·가운데 클릭 = 뒤쪽 새 탭", () => {
    expect(openTarget({ button: 0, ctrlKey: false, metaKey: false })).toBe("current");
    expect(openTarget({ button: 0, ctrlKey: true, metaKey: false })).toBe("background");
    expect(openTarget({ button: 1, ctrlKey: false, metaKey: false })).toBe("background");
  });
});
