import { describe, expect, it } from "vitest";
import { dragOutcome, parseSession, windowAt } from "./windows";

describe("세션 (창 여러 개)", () => {
  it("예전 형식(창 하나)도 읽는다", () => {
    expect(parseSession({ tabs: ["https://a.test/", "https://b.test/"], active: 1 })).toEqual({
      windows: [{ tabs: ["https://a.test/", "https://b.test/"], active: 1 }],
    });
  });
  it("창마다 탭과 위치, 탭 없는 창이나 이상한 값은 버린다", () => {
    const s = parseSession({
      windows: [
        { tabs: ["https://a.test/"], active: 5, bounds: { x: 10, y: 20, width: 800, height: 600 } },
        { tabs: [], active: 0 },
        { tabs: ["https://c.test/", 3], active: "x", bounds: { x: 1 } },
        null,
      ],
    });
    expect(s).toEqual({
      windows: [
        { tabs: ["https://a.test/"], active: 0, bounds: { x: 10, y: 20, width: 800, height: 600 } },
        { tabs: ["https://c.test/"], active: 0 },
      ],
    });
  });
  it("파일이 없거나 깨졌으면 창 없음 (시작 페이지로)", () => {
    expect(parseSession(null)).toEqual({ windows: [] });
    expect(parseSession("x")).toEqual({ windows: [] });
  });
});

describe("탭을 끌어 놓았을 때", () => {
  const source = { x: 100, y: 100, width: 1000, height: 800 };
  const base = { droppedOnStrip: false, source, stripBottom: 40, sourceTabs: 3 };

  it("어느 창의 탭 줄에 놓았으면 그 창이 옮기므로 아무것도 안 함", () => {
    expect(dragOutcome({ ...base, droppedOnStrip: true, cursor: { x: 2000, y: 50 } })).toEqual({ kind: "none" });
  });
  it("자기 창 탭 줄 안에서 놓으면(취소 등) 그대로", () => {
    expect(dragOutcome({ ...base, cursor: { x: 500, y: 120 } })).toEqual({ kind: "none" });
  });
  it("창 밖이나 페이지 위에 놓으면 새 창으로 떼어 냄", () => {
    expect(dragOutcome({ ...base, cursor: { x: 1500, y: 300 } })).toEqual({ kind: "newWindow" });
    expect(dragOutcome({ ...base, cursor: { x: 500, y: 500 } })).toEqual({ kind: "newWindow" });
  });
  it("다른 창의 탭 줄 빈 곳에 놓으면 그 창으로 합침 (탭 하나짜리 창도)", () => {
    const others = [{ x: 1300, y: 50, width: 800, height: 600 }];
    expect(dragOutcome({ ...base, others, cursor: { x: 1900, y: 70 } })).toEqual({ kind: "merge", target: 0 });
    expect(dragOutcome({ ...base, sourceTabs: 1, others, cursor: { x: 1900, y: 70 } })).toEqual({ kind: "merge", target: 0 });
    // 그 창의 페이지 위는 합치지 않고 새 창
    expect(dragOutcome({ ...base, others, cursor: { x: 1900, y: 400 } })).toEqual({ kind: "newWindow" });
  });
  it("탭이 하나뿐인 창은 떼어 내는 대신 창을 그 자리로 옮김", () => {
    expect(dragOutcome({ ...base, sourceTabs: 1, cursor: { x: 1500, y: 300 } })).toEqual({ kind: "moveWindow" });
  });
});

describe("새 창 위치", () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  it("마우스가 새 창의 탭 근처에 오도록", () => {
    expect(windowAt({ x: 600, y: 300 }, { width: 1000, height: 700 }, work)).toEqual({ x: 500, y: 282, width: 1000, height: 700 });
  });
  it("화면 밖으로 나가지 않게, 화면보다 크면 줄인다", () => {
    expect(windowAt({ x: 1900, y: 1000 }, { width: 1000, height: 700 }, work)).toEqual({ x: 920, y: 340, width: 1000, height: 700 });
    expect(windowAt({ x: 10, y: 10 }, { width: 3000, height: 2000 }, work)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
  });
});
