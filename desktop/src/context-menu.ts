// 페이지 오른쪽 클릭 메뉴: 누른 곳(링크·이미지·선택한 글·입력칸)에 맞는 항목 고르기 (Electron 없는 순수 함수)
// main.ts 가 항목 id 를 실제 동작으로 바꿔 메뉴를 띄운다

/** Electron 의 ContextMenuParams 중 쓰는 것만 */
export interface ContextInfo {
  linkURL: string;
  srcURL: string;
  mediaType: string;
  selectionText: string;
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
  canGoBack: boolean;
  canGoForward: boolean;
  /** 툴바(주소창)에서 연 메뉴: 입력칸 항목 + "붙여넣고 이동"만 */
  toolbar?: boolean;
}

export type ContextAction =
  | "openLinkTab"
  | "copyLink"
  | "openImageTab"
  | "saveImage"
  | "copyImage"
  | "copyImageUrl"
  | "cut"
  | "copy"
  | "paste"
  | "pasteAndGo"
  | "selectAll"
  | "search"
  | "back"
  | "forward"
  | "reload"
  | "inspect";

export type ContextItem = { id: ContextAction; label: string; enabled?: boolean } | { separator: true };

const SEP: ContextItem = { separator: true };
const web = (u: string) => /^https?:/i.test(u);

/** 선택한 글을 메뉴에 보일 때: 한 줄로, 길면 줄임 */
export function shortText(s: string, max = 20): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export function contextItems(p: ContextInfo): ContextItem[] {
  if (p.toolbar) {
    if (!p.isEditable) return [];
    return [
      { id: "cut", label: "잘라내기", enabled: p.editFlags.canCut },
      { id: "copy", label: "복사", enabled: p.editFlags.canCopy },
      { id: "paste", label: "붙여넣기", enabled: p.editFlags.canPaste },
      { id: "pasteAndGo", label: "붙여넣고 이동", enabled: p.editFlags.canPaste },
      SEP,
      { id: "selectAll", label: "모두 선택", enabled: p.editFlags.canSelectAll },
    ];
  }
  const groups: ContextItem[][] = [];
  if (p.linkURL && web(p.linkURL))
    groups.push([
      { id: "openLinkTab", label: "링크를 새 탭에서 열기" },
      { id: "copyLink", label: "링크 주소 복사" },
    ]);
  if (p.mediaType === "image" && p.srcURL)
    groups.push([
      { id: "openImageTab", label: "이미지를 새 탭에서 열기", enabled: web(p.srcURL) || p.srcURL.startsWith("data:") },
      { id: "saveImage", label: "이미지 저장" },
      { id: "copyImage", label: "이미지 복사" },
      { id: "copyImageUrl", label: "이미지 주소 복사", enabled: !p.srcURL.startsWith("data:") },
    ]);
  if (p.isEditable)
    groups.push([
      { id: "cut", label: "잘라내기", enabled: p.editFlags.canCut },
      { id: "copy", label: "복사", enabled: p.editFlags.canCopy },
      { id: "paste", label: "붙여넣기", enabled: p.editFlags.canPaste },
      { id: "selectAll", label: "모두 선택", enabled: p.editFlags.canSelectAll },
    ]);
  else if (p.selectionText.trim())
    groups.push([
      { id: "copy", label: "복사" },
      { id: "search", label: `Google 에서 "${shortText(p.selectionText)}" 검색` },
    ]);
  // 링크·이미지·글 위가 아니면 페이지 메뉴
  if (!groups.length)
    groups.push([
      { id: "back", label: "뒤로", enabled: p.canGoBack },
      { id: "forward", label: "앞으로", enabled: p.canGoForward },
      { id: "reload", label: "새로고침" },
      { id: "selectAll", label: "모두 선택" },
    ]);
  groups.push([{ id: "inspect", label: "검사 (F12)" }]);
  return groups.flatMap((g, i) => (i ? [SEP, ...g] : g));
}
