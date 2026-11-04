// 탭·북마크에 보여줄 사이트 아이콘 고르기 (Electron 없는 순수 함수)
// 1) 페이지가 알려준 favicon  2) 없으면 그 사이트의 /favicon.ico (이것도 없으면 화면에서 builtin "page" 로)
// 3) 앱 안쪽 페이지(시작·방문 기록·북마크 관리·다운로드 내역)는 앱 아이콘

export type BuiltinIcon = "home" | "history" | "bookmarks" | "downloads" | "page";
export type IconChoice = { src: string; fallback: BuiltinIcon } | { builtin: BuiltinIcon };

export function iconFor(url: string, favicon: string | null | undefined): IconChoice {
  if (/^file:/i.test(url)) {
    if (/\/start\.html$/i.test(url)) return { builtin: "home" };
    if (/\/history\.html$/i.test(url)) return { builtin: "history" };
    if (/\/bookmarks\.html$/i.test(url)) return { builtin: "bookmarks" };
    if (/\/downloads\.html$/i.test(url)) return { builtin: "downloads" };
    if (/\/clear\.html$/i.test(url)) return { builtin: "history" };
    return { builtin: "page" };
  }
  if (favicon) return { src: favicon, fallback: "page" };
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return { src: `${u.origin}/favicon.ico`, fallback: "page" };
  } catch {
    /* 주소가 아직 없음 (새 탭이 막 열림 등) */
  }
  return { builtin: "page" };
}
