import { describe, expect, it } from "vitest";
import { errorInfo, errorPageUrl, failedUrlOf, showsErrorPage } from "./error-page";
import { displayLink } from "./link-status";

const BASE = "file:///C:/app/dist/ui/error.html";

describe("오류 화면", () => {
  it("오류 번호마다 알맞은 말", () => {
    expect(errorInfo(-105)).toMatchObject({ kind: "dns", title: "사이트 주소를 찾을 수 없어요" });
    expect(errorInfo(-106).kind).toBe("offline");
    expect(errorInfo(-202).kind).toBe("cert"); // ERR_CERT_AUTHORITY_INVALID
    expect(errorInfo(-118).kind).toBe("timeout");
    expect(errorInfo(-999).kind).toBe("other");
    expect(errorInfo(0, "crash").kind).toBe("crash");
  });

  it("사용자가 멈춘 것(-3)은 오류 화면을 띄우지 않는다", () => {
    expect(showsErrorPage(-3)).toBe(false);
    expect(showsErrorPage(-105)).toBe(true);
  });

  it("오류 화면 주소에서 원래 주소를 되찾는다 (http(s) 만)", () => {
    const u = errorPageUrl(BASE, "https://gall.dcinside.com/board/lists/?id=a&page=2", -105);
    expect(failedUrlOf(u)).toBe("https://gall.dcinside.com/board/lists/?id=a&page=2");
    expect(failedUrlOf(errorPageUrl(BASE, "javascript:alert(1)", -105))).toBeNull();
    expect(failedUrlOf("https://example.com/ui/error.html?url=https://a.com")).toBeNull();
    expect(failedUrlOf(BASE.replace("error", "start"))).toBeNull();
  });
});

describe("링크 주소 표시", () => {
  it("https:// 는 빼고, 한글은 풀어서", () => {
    expect(displayLink("https://gall.dcinside.com/board/lists/?id=%EA%B0%80")).toBe("gall.dcinside.com/board/lists/?id=가");
    expect(displayLink("http://a.com/")).toBe("http://a.com/");
    expect(displayLink("https://a.com/%E0%A4%A")).toBe("a.com/%E0%A4%A"); // 잘못된 인코딩은 그대로
  });
  it("너무 길면 가운데를 줄인다", () => {
    const s = displayLink("https://a.com/" + "x".repeat(300), 50);
    expect(s.length).toBe(50);
    expect(s).toContain("…");
  });
});
