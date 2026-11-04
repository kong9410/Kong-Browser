// 여러 창: 세션 저장 형식과 탭을 끌어 놓았을 때의 결과 (Electron 없는 순수 함수)

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 창 하나의 탭들 (다시 실행하면 복원) */
export interface WindowSession {
  tabs: string[];
  active: number;
  bounds?: Bounds;
  /** 앞에서부터 이만큼은 고정 탭 */
  pinned?: number;
}
export interface Session {
  windows: WindowSession[];
}

const isBounds = (b: unknown): b is Bounds =>
  !!b && typeof b === "object" && ["x", "y", "width", "height"].every((k) => typeof (b as Record<string, unknown>)[k] === "number");

function parseWindow(raw: unknown): WindowSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tabs = Array.isArray(r.tabs) ? r.tabs.filter((t): t is string => typeof t === "string") : [];
  if (!tabs.length) return null;
  const active = typeof r.active === "number" ? Math.min(Math.max(0, r.active), tabs.length - 1) : 0;
  const w: WindowSession = { tabs, active };
  if (isBounds(r.bounds)) w.bounds = r.bounds;
  if (typeof r.pinned === "number" && r.pinned > 0) w.pinned = Math.min(Math.floor(r.pinned), tabs.length);
  return w;
}

/** session.json 읽기. 예전 형식({tabs, active}, 창 하나)도 읽는다. 탭이 없는 창은 버린다 */
export function parseSession(raw: unknown): Session {
  if (!raw || typeof raw !== "object") return { windows: [] };
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.windows) ? r.windows : [r];
  return { windows: list.map(parseWindow).filter((w): w is WindowSession => !!w) };
}

export type DragOutcome = { kind: "none" | "moveWindow" | "newWindow" } | { kind: "merge"; target: number };

const onStrip = (c: { x: number; y: number }, b: Bounds, stripBottom: number) =>
  c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + stripBottom;

/**
 * 탭을 끌다 놓았을 때 할 일
 * - 어느 창의 탭 위에 놓았으면(그 창이 이미 옮김) 아무것도 안 함
 * - 자기 창의 탭 줄 높이 안에서 놓았으면(취소 등) 아무것도 안 함
 * - 다른 창의 탭 줄 빈 곳(창 끌기 영역이라 놓기가 전달되지 않음)이면 그 창 맨 끝으로 합침
 * - 그 밖(창 밖, 페이지 위 등)이면: 탭이 하나뿐인 창은 창을 그 자리로 옮기고, 아니면 새 창으로 떼어 낸다
 */
export function dragOutcome(p: {
  droppedOnStrip: boolean;
  cursor: { x: number; y: number };
  source: Bounds;
  /** 다른 창들 (앞쪽이 위에 있는 창) */
  others?: Bounds[];
  /** 창 위쪽에서 탭 줄 아래 끝까지 높이 */
  stripBottom: number;
  sourceTabs: number;
}): DragOutcome {
  if (p.droppedOnStrip || onStrip(p.cursor, p.source, p.stripBottom)) return { kind: "none" };
  const target = (p.others ?? []).findIndex((b) => onStrip(p.cursor, b, p.stripBottom));
  if (target >= 0) return { kind: "merge", target };
  return { kind: p.sourceTabs <= 1 ? "moveWindow" : "newWindow" };
}

/** 떼어 낸 탭의 새 창 위치: 마우스가 새 창의 탭 근처에 오도록 (화면 밖으로 너무 나가지 않게) */
export function windowAt(cursor: { x: number; y: number }, size: { width: number; height: number }, work: Bounds): Bounds {
  const width = Math.min(size.width, work.width);
  const height = Math.min(size.height, work.height);
  const x = Math.min(Math.max(work.x, Math.round(cursor.x - 100)), work.x + work.width - width);
  const y = Math.min(Math.max(work.y, Math.round(cursor.y - 18)), work.y + work.height - height);
  return { x, y, width, height };
}
