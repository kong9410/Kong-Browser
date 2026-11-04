// 탭 관련 순수 로직: 닫은 탭 기억(Ctrl+Shift+T), 탭 오른쪽 클릭 메뉴, 고정 탭 순서

/** 닫은 탭 하나: 다시 열면 뒤로/앞으로 기록까지 되살린다 */
export interface ClosedTab {
  url: string;
  /** navigationHistory.getAllEntries() 결과 (없으면 주소만) */
  entries?: { url: string; title: string }[];
  index?: number;
  /** 있던 자리 */
  position: number;
  pinned: boolean;
}

export const CLOSED_MAX = 25;

/** 닫은 탭 목록 (최근 것이 끝). 시작 페이지 같은 빈 탭은 기억하지 않는다 */
export function pushClosed(list: ClosedTab[], t: ClosedTab, isBlank: (url: string) => boolean): ClosedTab[] {
  if (!t.url || isBlank(t.url)) return list;
  const next = [...list, t];
  return next.length > CLOSED_MAX ? next.slice(next.length - CLOSED_MAX) : next;
}

export type TabMenuAction = "newTab" | "reload" | "duplicate" | "pin" | "mute" | "close" | "closeOthers" | "closeRight" | "reopen";
export type TabMenuItem = { id: TabMenuAction; label: string; enabled?: boolean } | { separator: true };

/** 탭 오른쪽 클릭 메뉴 (Chrome 과 같은 순서) */
export function tabMenuItems(o: { index: number; count: number; pinned: boolean; muted: boolean; hasClosed: boolean }): TabMenuItem[] {
  return [
    { id: "newTab", label: "오른쪽에 새 탭" },
    { separator: true },
    { id: "reload", label: "새로고침" },
    { id: "duplicate", label: "복제" },
    { id: "pin", label: o.pinned ? "고정 해제" : "고정" },
    { id: "mute", label: o.muted ? "사이트 음소거 해제" : "사이트 음소거" },
    { separator: true },
    { id: "close", label: "닫기" },
    { id: "closeOthers", label: "다른 탭 닫기", enabled: o.count > 1 },
    { id: "closeRight", label: "오른쪽 탭 닫기", enabled: o.index < o.count - 1 },
    { separator: true },
    { id: "reopen", label: "닫은 탭 다시 열기", enabled: o.hasClosed },
  ];
}

/** 고정 탭은 항상 왼쪽: 옮길 자리를 고정/보통 구역 안으로 (pinnedCount = 옮기는 탭을 뺀 고정 탭 수) */
export function clampPosition(to: number, pinned: boolean, pinnedCount: number, total: number): number {
  return pinned ? Math.max(0, Math.min(to, pinnedCount)) : Math.max(pinnedCount, Math.min(to, total));
}
