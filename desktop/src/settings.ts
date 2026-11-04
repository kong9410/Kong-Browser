// 사용자 설정 (settings.json) 의 모양과 기본값 (Electron 없는 순수 함수, 파일 읽기·쓰기는 main.ts)
import { SEARCH_ENGINES, type SearchEngineId } from "./search-engines";

export interface Settings {
  /** 통일 화면의 왼쪽 메뉴 펼침 */
  navOpen: boolean;
  /** 북마크 바 표시 (Ctrl+Shift+B) */
  bookmarkBar: boolean;
  /** 오른쪽 dock 표시 */
  dockOpen: boolean;
  /** 원본 화면으로 보기 (툴바의 원본/통합 토글). 페이지를 옮겨도, 다시 실행해도 유지 */
  original: boolean;
  /** 시작할 때: 지난번 창·탭 다시 열기 / 시작 페이지 */
  startup: "restore" | "home";
  /** 주소창·오른쪽 클릭 검색에 쓰는 검색 엔진 */
  searchEngine: SearchEngineId;
  /** 다운로드 저장 위치. null 이면 운영체제의 다운로드 폴더 */
  downloadDir: string | null;
  /** 받기 전에 저장 위치 묻기 */
  askDownload: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  navOpen: true,
  bookmarkBar: true,
  dockOpen: true,
  original: false,
  startup: "restore",
  searchEngine: "google",
  downloadDir: null,
  askDownload: false,
};

/** 항목마다 올바른 값인지 (설정 페이지에서 온 값도 이것으로 확인) */
const VALID: { [K in keyof Settings]: (v: unknown) => v is Settings[K] } = {
  navOpen: (v): v is boolean => typeof v === "boolean",
  bookmarkBar: (v): v is boolean => typeof v === "boolean",
  dockOpen: (v): v is boolean => typeof v === "boolean",
  original: (v): v is boolean => typeof v === "boolean",
  startup: (v): v is Settings["startup"] => v === "restore" || v === "home",
  searchEngine: (v): v is SearchEngineId => typeof v === "string" && Object.hasOwn(SEARCH_ENGINES, v),
  downloadDir: (v): v is string | null => v === null || (typeof v === "string" && v.trim().length > 0),
  askDownload: (v): v is boolean => typeof v === "boolean",
};

export const isSettingKey = (k: unknown): k is keyof Settings => typeof k === "string" && Object.hasOwn(VALID, k);
export const validSetting = <K extends keyof Settings>(k: K, v: unknown): v is Settings[K] => VALID[k](v);

/** 저장된 값 읽기: 없거나 이상한 값은 기본값으로 (예전 버전 파일에 없던 항목도 기본값) */
export function parseSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === "object")
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (VALID[k](v)) (s as unknown as Record<string, unknown>)[k] = v;
    }
  return s;
}
