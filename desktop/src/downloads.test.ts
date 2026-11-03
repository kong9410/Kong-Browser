import { describe, expect, it } from "vitest";
import { formatBytes, overall, restoreDownloads, searchDownloads, statusText, uniqueName, type DownloadInfo } from "./downloads";

const dl = (p: Partial<DownloadInfo>): DownloadInfo => ({
  id: 1,
  name: "a.zip",
  path: "C:/Downloads/a.zip",
  url: "https://x.test/a.zip",
  received: 0,
  total: 0,
  state: "progressing",
  startedAt: 0,
  ...p,
});

describe("다운로드", () => {
  it("크기 글자", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250MB");
  });

  it("상태 글자: 진행률·크기, 완료, 실패, 크기를 모를 때", () => {
    expect(statusText(dl({ received: 512 * 1024, total: 2 * 1024 * 1024 }))).toBe("25% · 512KB / 2.0MB");
    expect(statusText(dl({ received: 3000 }))).toBe("2.9KB");
    expect(statusText(dl({ state: "completed", received: 2048, total: 2048 }))).toBe("완료 · 2.0KB");
    expect(statusText(dl({ state: "interrupted" }))).toBe("실패");
    expect(statusText(dl({ state: "cancelled" }))).toBe("취소됨");
  });

  it("툴바 전체 진행: 진행 중인 것만 합치고, 크기를 모르면 null, 없으면 null", () => {
    expect(overall([dl({ received: 50, total: 100 }), dl({ received: 150, total: 300 }), dl({ state: "completed", received: 1, total: 9 })])).toEqual({
      active: 2,
      ratio: 0.5,
    });
    expect(overall([dl({ received: 50, total: 100 }), dl({ received: 10 })])).toEqual({ active: 2, ratio: null });
    expect(overall([dl({ state: "completed" })])).toBeNull();
  });

  it("같은 이름이 있으면 (1), (2) …, 파일 이름에 못 쓰는 글자는 _", () => {
    const have = new Set(["a.zip", "a (1).zip", "README"]);
    expect(uniqueName("a.zip", (n) => have.has(n))).toBe("a (2).zip");
    expect(uniqueName("README", (n) => have.has(n))).toBe("README (1)");
    expect(uniqueName('x:y?.txt', () => false)).toBe("x_y_.txt");
    expect(uniqueName("", () => false)).toBe("download");
  });
});

describe("다운로드 내역", () => {
  it("다시 실행하면: 받던 것은 실패로, 형식이 이상한 항목은 버린다", () => {
    const list = restoreDownloads([dl({ id: 1, state: "progressing" }), dl({ id: 2, state: "completed" }), { id: "x" }, null]);
    expect(list.map((d) => [d.id, d.state])).toEqual([
      [1, "interrupted"],
      [2, "completed"],
    ]);
    expect(restoreDownloads("broken")).toEqual([]);
  });

  it("검색: 파일 이름이나 주소", () => {
    const list = [dl({ id: 1, name: "사진.png", url: "https://img.test/1" }), dl({ id: 2, name: "a.zip", url: "https://files.ruliweb.com/a" })];
    expect(searchDownloads(list, "사진").map((d) => d.id)).toEqual([1]);
    expect(searchDownloads(list, "RULIWEB").map((d) => d.id)).toEqual([2]);
    expect(searchDownloads(list).length).toBe(2);
  });
});
