import { describe, expect, it } from "vitest";
import { isPopup, popupSize } from "./popup";

describe("사이트가 여는 새 창", () => {
  it("크기를 준 window.open 은 팝업 창 (디시 에디터 [이미지] 업로드 창)", () => {
    expect(isPopup("new-window", "menubar=no,width=606,height=498,toolbar=no,resize=no")).toBe(true);
    expect(isPopup("other", "width=400,height=300")).toBe(true);
    expect(isPopup("other", "popup")).toBe(true);
  });
  it("target=_blank 링크, Ctrl+클릭, 창 모양 없는 window.open 은 새 탭", () => {
    expect(isPopup("foreground-tab", "")).toBe(false);
    expect(isPopup("background-tab", "")).toBe(false);
    expect(isPopup("other", "noopener")).toBe(false);
  });
  it("팝업 크기", () => {
    expect(popupSize("menubar=no,width=606,height=498,toolbar=no")).toEqual({ width: 606, height: 498 });
    expect(popupSize("width=606")).toBeNull();
    expect(popupSize("")).toBeNull();
  });
});
