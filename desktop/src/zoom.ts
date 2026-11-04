// 확대·축소: Chrome 과 같은 단계, 사이트(호스트)별로 기억 (zoom.json)

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/** 다음 단계 (dir: 1 = 확대, -1 = 축소). 단계 사이 값이면 가까운 다음 단계로 */
export function stepZoom(current: number, dir: 1 | -1): number {
  const eps = 0.001;
  if (dir > 0) return ZOOM_STEPS.find((z) => z > current + eps) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < current - eps) ?? ZOOM_STEPS[0];
}

export const zoomPercent = (factor: number) => `${Math.round(factor * 100)}%`;
export const isDefaultZoom = (factor: number) => Math.abs(factor - 1) < 0.001;

/** 호스트 → 배율. 기본(100%)은 저장하지 않는다 */
export type ZoomStore = Record<string, number>;

export function setSiteZoom(store: ZoomStore, host: string, factor: number): ZoomStore {
  const next = { ...store };
  if (isDefaultZoom(factor)) delete next[host];
  else next[host] = factor;
  return next;
}

export function parseZoom(raw: unknown): ZoomStore {
  const out: ZoomStore = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [host, v] of Object.entries(raw as Record<string, unknown>))
    if (typeof v === "number" && v >= ZOOM_STEPS[0] && v <= ZOOM_STEPS[ZOOM_STEPS.length - 1] && !isDefaultZoom(v)) out[host] = v;
  return out;
}
