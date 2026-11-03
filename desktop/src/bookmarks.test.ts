import { describe, expect, it } from "vitest";
import * as bm from "./bookmarks";

const page = (n: number) => ({ url: `https://site${n}.com/`, title: `사이트 ${n}`, favicon: null });

describe("북마크 폴더", () => {
  it("예전 형식(배열)을 읽으면 모두 북마크 바에", () => {
    const d = bm.migrate([{ url: "https://a.com/", title: "A", favicon: null, createdAt: 1 }]);
    expect(d.folders).toEqual([]);
    expect(d.bookmarks[0]).toMatchObject({ url: "https://a.com/", folder: null });
  });

  it("이상한 파일이면 빈 북마크", () => expect(bm.migrate("x")).toEqual(bm.emptyBookmarks()));

  it("같은 주소는 두 번 추가되지 않는다", () => {
    const d = bm.emptyBookmarks();
    bm.add(d, page(1));
    bm.add(d, page(1));
    expect(d.bookmarks).toHaveLength(1);
  });

  it("폴더를 만들고 북마크를 옮기면 tree 에 폴더별로", () => {
    const d = bm.emptyBookmarks();
    bm.add(d, page(1));
    bm.add(d, page(2));
    const f = bm.addFolder(d, "  커뮤니티 ", "f1")!;
    expect(f.name).toBe("커뮤니티");
    bm.move(d, page(2).url, "f1");
    const t = bm.tree(d);
    expect(t.root.map((b) => b.title)).toEqual(["사이트 1"]);
    expect(t.folders).toEqual([{ folder: f, bookmarks: [expect.objectContaining({ title: "사이트 2", folder: "f1" })] }]);
    expect(bm.folderName(d, "f1")).toBe("커뮤니티");
  });

  it("이름이 빈 폴더는 만들지 않는다, 없는 폴더로는 옮기지 않는다", () => {
    const d = bm.emptyBookmarks();
    bm.add(d, page(1));
    expect(bm.addFolder(d, "   ", "f1")).toBeNull();
    bm.move(d, page(1).url, "nope");
    expect(d.bookmarks[0].folder).toBeNull();
  });

  it("폴더를 지우면 안의 북마크는 북마크 바로 나온다 (지워지지 않음)", () => {
    const d = bm.emptyBookmarks();
    bm.add(d, page(1));
    bm.addFolder(d, "임시", "f1");
    bm.move(d, page(1).url, "f1");
    bm.removeFolder(d, "f1");
    expect(d.folders).toEqual([]);
    expect(d.bookmarks).toEqual([expect.objectContaining({ url: page(1).url, folder: null })]);
  });

  it("이름 바꾸기 (빈 이름은 무시)", () => {
    const d = bm.emptyBookmarks();
    bm.add(d, page(1));
    bm.addFolder(d, "가", "f1");
    bm.rename(d, page(1).url, " 새 이름 ");
    bm.rename(d, page(1).url, "  ");
    bm.renameFolder(d, "f1", "나");
    bm.renameFolder(d, "f1", "");
    expect(d.bookmarks[0].title).toBe("새 이름");
    expect(d.folders[0].name).toBe("나");
  });

  it("삭제", () => {
    const d = bm.emptyBookmarks();
    bm.add(d, page(1));
    bm.add(d, page(2));
    bm.remove(d, page(1).url);
    expect(d.bookmarks.map((b) => b.url)).toEqual([page(2).url]);
  });
});
