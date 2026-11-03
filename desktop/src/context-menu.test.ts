import { describe, expect, it } from "vitest";
import { contextItems, shortText, type ContextInfo } from "./context-menu";

const at = (p: Partial<ContextInfo>): ContextInfo => ({
  linkURL: "",
  srcURL: "",
  mediaType: "none",
  selectionText: "",
  isEditable: false,
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
  canGoBack: true,
  canGoForward: false,
  ...p,
});
const ids = (p: Partial<ContextInfo>) => contextItems(at(p)).map((i) => ("id" in i ? i.id : "-"));

describe("오른쪽 클릭 메뉴", () => {
  it("이미지: 새 탭에서 열기, 저장, 복사, 주소 복사", () => {
    expect(ids({ mediaType: "image", srcURL: "https://img.test/a.png" })).toEqual([
      "openImageTab",
      "saveImage",
      "copyImage",
      "copyImageUrl",
      "-",
      "inspect",
    ]);
  });

  it("링크 걸린 이미지: 링크 항목 다음에 이미지 항목", () => {
    expect(ids({ linkURL: "https://a.test/1", mediaType: "image", srcURL: "https://img.test/a.png" }).slice(0, 7)).toEqual([
      "openLinkTab",
      "copyLink",
      "-",
      "openImageTab",
      "saveImage",
      "copyImage",
      "copyImageUrl",
    ]);
  });

  it("선택한 글: 복사, 검색 (검색어는 한 줄로 줄여 보임)", () => {
    const items = contextItems(at({ selectionText: "  안녕하세요\n반갑습니다 오늘 날씨가 좋네요 " }));
    expect(items.map((i) => ("id" in i ? i.id : "-"))).toEqual(["copy", "search", "-", "inspect"]);
    expect(items[1]).toMatchObject({ label: 'Google 에서 "안녕하세요 반갑습니다 오늘 날씨가 좋…" 검색' });
  });

  it("입력칸: 잘라내기·복사·붙여넣기·모두 선택 (할 수 없는 건 흐리게)", () => {
    const items = contextItems(at({ isEditable: true, editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } }));
    expect(items.slice(0, 4)).toEqual([
      { id: "cut", label: "잘라내기", enabled: false },
      { id: "copy", label: "복사", enabled: false },
      { id: "paste", label: "붙여넣기", enabled: true },
      { id: "selectAll", label: "모두 선택", enabled: true },
    ]);
  });

  it("빈 곳: 뒤로·앞으로·새로고침", () => {
    expect(ids({})).toEqual(["back", "forward", "reload", "selectAll", "-", "inspect"]);
    expect(contextItems(at({}))[1]).toMatchObject({ id: "forward", enabled: false });
  });

  it("javascript: 링크는 링크 항목 없음", () => {
    expect(ids({ linkURL: "javascript:;" })[0]).toBe("back");
  });

  it("줄임", () => expect(shortText("가".repeat(25))).toBe("가".repeat(20) + "…"));
});

describe("주소창 오른쪽 클릭", () => {
  it("입력칸 항목 + 붙여넣고 이동 (페이지 항목·검사는 없음)", () => {
    const items = contextItems(at({ toolbar: true, isEditable: true, editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true } }));
    expect(items.map((i) => ("id" in i ? i.id : "-"))).toEqual(["cut", "copy", "paste", "pasteAndGo", "-", "selectAll"]);
  });
  it("클립보드가 비어 있으면 붙여넣기·붙여넣고 이동은 흐리게", () => {
    const items = contextItems(at({ toolbar: true, isEditable: true, editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true } }));
    expect(items.find((i) => "id" in i && i.id === "pasteAndGo")).toMatchObject({ enabled: false });
  });
  it("툴바의 입력칸이 아닌 곳(버튼 등)은 메뉴 없음", () => {
    expect(contextItems(at({ toolbar: true }))).toEqual([]);
  });
});
