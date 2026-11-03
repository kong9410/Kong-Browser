// 다운로드 목록과 진행 표시 (Electron 없는 순수 함수). main.ts 가 DownloadItem 이벤트로 상태를 채운다

export type DownloadStateName = "progressing" | "paused" | "completed" | "cancelled" | "interrupted";

export interface DownloadInfo {
  id: number;
  /** 저장된 파일 이름 */
  name: string;
  /** 저장 위치 (전체 경로) */
  path: string;
  url: string;
  received: number;
  /** 전체 크기. 서버가 알려주지 않으면 0 */
  total: number;
  state: DownloadStateName;
  startedAt: number;
}

/** 1536 → "1.5KB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

/** 0~1, 크기를 모르면 null */
export const ratio = (d: DownloadInfo): number | null => (d.total > 0 ? Math.min(1, d.received / d.total) : null);

/** 메뉴에 보일 상태 글자 */
export function statusText(d: DownloadInfo): string {
  switch (d.state) {
    case "completed":
      return `완료 · ${formatBytes(d.total || d.received)}`;
    case "cancelled":
      return "취소됨";
    case "interrupted":
      return "실패";
    case "paused":
      return `일시 중지 · ${progressText(d)}`;
    default:
      return progressText(d);
  }
}

function progressText(d: DownloadInfo): string {
  const r = ratio(d);
  return r === null ? formatBytes(d.received) : `${Math.floor(r * 100)}% · ${formatBytes(d.received)} / ${formatBytes(d.total)}`;
}

export const isActive = (d: DownloadInfo) => d.state === "progressing" || d.state === "paused";

/**
 * 툴바 버튼에 보일 전체 진행: 진행 중인 다운로드들의 합. 진행 중인 게 없으면 null.
 * 크기를 모르는 다운로드가 섞이면 ratio 는 null (빙글 도는 표시)
 */
export function overall(list: readonly DownloadInfo[]): { active: number; ratio: number | null } | null {
  const act = list.filter(isActive);
  if (!act.length) return null;
  if (act.some((d) => d.total <= 0)) return { active: act.length, ratio: null };
  const total = act.reduce((s, d) => s + d.total, 0);
  const got = act.reduce((s, d) => s + d.received, 0);
  return { active: act.length, ratio: Math.min(1, got / total) };
}

/** 같은 이름의 파일이 있으면 Chrome 처럼 "이름 (1).확장자" */
export function uniqueName(name: string, exists: (n: string) => boolean): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_").trim() || "download";
  if (!exists(safe)) return safe;
  const dot = safe.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ""];
  for (let i = 1; ; i++) {
    const n = `${base} (${i})${ext}`;
    if (!exists(n)) return n;
  }
}

/** 다운로드 내역에 남기는 최대 개수 (오래된 것부터 지움) */
export const DOWNLOADS_MAX = 500;

/**
 * 저장된 내역 읽기: 형식이 맞는 것만, 최대 개수까지.
 * 지난 실행에서 받다가 앱을 끈 것은 이어 받을 수 없으므로 실패로 바꾼다
 */
export function restoreDownloads(raw: unknown): DownloadInfo[] {
  if (!Array.isArray(raw)) return [];
  const states: DownloadStateName[] = ["progressing", "paused", "completed", "cancelled", "interrupted"];
  return raw
    .filter(
      (d): d is DownloadInfo =>
        !!d && typeof d === "object" && typeof d.id === "number" && typeof d.name === "string" && typeof d.path === "string" && states.includes(d.state),
    )
    .slice(0, DOWNLOADS_MAX)
    .map((d) => (isActive(d) ? { ...d, state: "interrupted" as const } : d));
}

/** 내역 검색: 파일 이름이나 받은 주소 */
export function searchDownloads<T extends DownloadInfo>(list: readonly T[], query = ""): T[] {
  const q = query.trim().toLowerCase();
  return q ? list.filter((d) => d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q)) : [...list];
}
