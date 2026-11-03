// 사용자 설정 (settings.json) 의 모양과 기본값 (Electron 없는 순수 함수, 파일 읽기·쓰기는 main.ts)

export interface Settings {
  /** 통일 화면의 왼쪽 메뉴 펼침 */
  navOpen: boolean;
  /** 북마크 바 표시 (Ctrl+Shift+B) */
  bookmarkBar: boolean;
  /** 오른쪽 dock 표시 */
  dockOpen: boolean;
  /** 원본 화면으로 보기 (툴바의 원본/통합 토글). 페이지를 옮겨도, 다시 실행해도 유지 */
  original: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { navOpen: true, bookmarkBar: true, dockOpen: true, original: false };

/** 저장된 값 읽기: 없거나 이상한 값은 기본값으로 (예전 버전 파일에 없던 항목도 기본값) */
export function parseSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === "object")
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "boolean") s[k] = v;
    }
  return s;
}
