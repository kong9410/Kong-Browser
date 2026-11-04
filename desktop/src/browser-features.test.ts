import { describe, expect, it } from "vitest";
import { decide, isAllowed, parsePermissions, permissionKeys, remember, siteName } from "./permissions";
import { CLOSED_MAX, clampPosition, pushClosed, tabMenuItems, type ClosedTab } from "./tabs";
import { parseSession } from "./windows";
import { parseZoom, setSiteZoom, stepZoom, zoomPercent } from "./zoom";

const DC = "https://gall.dcinside.com";

describe("사이트 권한", () => {
  it("알림·위치·카메라·마이크는 묻는다", () => {
    expect(decide({}, DC, "notifications")).toEqual({ kind: "ask", keys: ["notifications"], label: "알림 표시" });
    expect(decide({}, DC, "geolocation")).toMatchObject({ kind: "ask", label: "내 위치 확인" });
    expect(decide({}, DC, "media", ["video", "audio"])).toEqual({ kind: "ask", keys: ["camera", "microphone"], label: "카메라 사용, 마이크 사용" });
    expect(decide({}, DC, "media", ["audio"])).toMatchObject({ keys: ["microphone"] });
  });

  it("전체 화면·클립보드 쓰기는 묻지 않고 허용, USB 같은 모르는 권한은 거절", () => {
    expect(decide({}, DC, "fullscreen")).toEqual({ kind: "allow" });
    expect(decide({}, DC, "clipboard-sanitized-write")).toEqual({ kind: "allow" });
    expect(decide({}, DC, "usb")).toEqual({ kind: "deny" });
    expect(decide({}, DC, "hid")).toEqual({ kind: "deny" });
  });

  it("앱 안쪽 페이지는 허용, 웹이 아닌 주소는 거절", () => {
    expect(decide({}, "file:", "notifications")).toEqual({ kind: "allow" });
    expect(decide({}, "chrome-extension://x", "notifications")).toEqual({ kind: "deny" });
  });

  it("고른 답을 사이트별로 기억한다", () => {
    let s = remember({}, DC, ["notifications"], "block");
    expect(decide(s, DC, "notifications")).toEqual({ kind: "deny" });
    expect(decide(s, "https://bbs.ruliweb.com", "notifications").kind).toBe("ask");
    s = remember(s, DC, ["camera", "microphone"], "allow");
    expect(decide(s, DC, "media", ["video", "audio"])).toEqual({ kind: "allow" });
    // 카메라만 허용해 둔 상태에서 둘 다 요청하면 다시 묻는다
    const camOnly = remember({}, DC, ["camera"], "allow");
    expect(decide(camOnly, DC, "media", ["video", "audio"]).kind).toBe("ask");
    expect(isAllowed(s, DC, "notifications")).toBe(false);
    expect(isAllowed(s, DC, "media", "video")).toBe(true);
    expect(isAllowed({}, DC, "fullscreen")).toBe(true);
  });

  it("저장 파일 정리·사이트 이름", () => {
    expect(parsePermissions({ [DC]: { notifications: "allow", x: "maybe" }, bad: 3 })).toEqual({ [DC]: { notifications: "allow" } });
    expect(parsePermissions(null)).toEqual({});
    expect(siteName("https://gall.dcinside.com")).toBe("gall.dcinside.com");
    expect(permissionKeys("media")).toEqual(["camera", "microphone"]);
  });
});

describe("확대/축소", () => {
  it("Chrome 과 같은 단계로", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.2, 1)).toBe(1.25); // 단계 사이 값이면 가까운 다음 단계
    expect(stepZoom(5, 1)).toBe(5);
    expect(stepZoom(0.25, -1)).toBe(0.25);
    expect(zoomPercent(1.25)).toBe("125%");
  });

  it("사이트별로 기억, 100% 는 저장하지 않음", () => {
    const s = setSiteZoom({}, "gall.dcinside.com", 1.25);
    expect(s).toEqual({ "gall.dcinside.com": 1.25 });
    expect(setSiteZoom(s, "gall.dcinside.com", 1)).toEqual({});
    expect(parseZoom({ a: 1.5, b: 1, c: 99, d: "x" })).toEqual({ a: 1.5 });
  });
});

describe("탭", () => {
  const closed = (url: string): ClosedTab => ({ url, position: 0, pinned: false });
  it("닫은 탭: 빈 탭은 기억하지 않고, 최근 25개까지", () => {
    const blank = (u: string) => u.endsWith("start.html");
    expect(pushClosed([], closed("file:///x/start.html"), blank)).toEqual([]);
    let list: ClosedTab[] = [];
    for (let i = 0; i < CLOSED_MAX + 3; i++) list = pushClosed(list, closed(`https://a.com/${i}`), blank);
    expect(list).toHaveLength(CLOSED_MAX);
    expect(list.at(-1)!.url).toBe(`https://a.com/${CLOSED_MAX + 2}`);
  });

  it("탭 메뉴: 상태에 따라 글자와 사용 가능 여부", () => {
    const items = tabMenuItems({ index: 2, count: 3, pinned: true, muted: true, hasClosed: false });
    const get = (id: string) => items.find((i) => "id" in i && i.id === id) as { label: string; enabled?: boolean };
    expect(get("pin").label).toBe("고정 해제");
    expect(get("mute").label).toBe("사이트 음소거 해제");
    expect(get("closeRight").enabled).toBe(false);
    expect(get("closeOthers").enabled).toBe(true);
    expect(get("reopen").enabled).toBe(false);
  });

  it("고정 탭은 왼쪽 구역에만, 보통 탭은 그 오른쪽에만", () => {
    // 고정 2개 + 보통 3개 (옮기는 탭을 뺀 수)
    expect(clampPosition(0, false, 2, 5)).toBe(2);
    expect(clampPosition(9, false, 2, 5)).toBe(5);
    expect(clampPosition(4, true, 2, 5)).toBe(2);
    expect(clampPosition(1, true, 2, 5)).toBe(1);
  });

  it("세션에 고정 탭 수를 저장·복원", () => {
    expect(parseSession({ windows: [{ tabs: ["a", "b"], active: 0, pinned: 1 }] }).windows[0].pinned).toBe(1);
    expect(parseSession({ windows: [{ tabs: ["a"], active: 0, pinned: 7 }] }).windows[0].pinned).toBe(1);
    expect(parseSession({ windows: [{ tabs: ["a"], active: 0 }] }).windows[0].pinned).toBeUndefined();
  });
});
