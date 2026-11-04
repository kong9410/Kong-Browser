// 사이트 권한 (알림·위치·카메라·마이크 등): Electron 은 기본으로 전부 허용하므로 Chrome 처럼 묻는다.
// 고른 답은 사이트(origin)별로 permissions.json 에 기억한다. 순수 로직만 (main.ts 가 Electron 과 연결)

export type Decision = "allow" | "block";
/** origin → (권한 키 → 결정). 권한 키는 media 를 camera / microphone 으로 나눈 것 */
export type PermissionStore = Record<string, Record<string, Decision>>;

/** 묻지 않고 허용 (Chrome 도 묻지 않는 것): 전체 화면, 클립보드 쓰기, 마우스 잠금, 파일 선택 창 등 */
const SILENT_ALLOW = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "keyboardLock", "fileSystem", "storage-access", "top-level-storage-access", "speaker-selection"]);

/** 물어볼 권한과 그 이름 (창에 "○○ 사용" 으로 나온다) */
const ASK_LABEL: Record<string, string> = {
  notifications: "알림 표시",
  geolocation: "내 위치 확인",
  camera: "카메라 사용",
  microphone: "마이크 사용",
  "clipboard-read": "클립보드 읽기",
  midi: "MIDI 기기 사용",
  midiSysex: "MIDI 기기 제어",
  openExternal: "외부 앱 열기",
  "window-management": "창 위치·크기 관리",
  idleDetection: "사용 중인지 감지",
  "idle-detection": "사용 중인지 감지",
};

/** 요청 하나를 권한 키들로 (카메라+마이크를 함께 요청하면 둘 다) */
export function permissionKeys(permission: string, mediaTypes?: readonly string[]): string[] {
  if (permission !== "media") return [permission];
  const keys: string[] = [];
  if (!mediaTypes?.length || mediaTypes.includes("video")) keys.push("camera");
  if (!mediaTypes?.length || mediaTypes.includes("audio")) keys.push("microphone");
  return keys;
}

export type Verdict = { kind: "allow" } | { kind: "deny" } | { kind: "ask"; keys: string[]; label: string };

/**
 * 요청을 어떻게 처리할지: 묻지 않고 허용 / 거절 / 물어보기.
 * 앱 안쪽 페이지(file:)는 허용. 모르는 권한(USB·HID 등)은 거절. 이미 고른 답이 있으면 그대로
 */
export function decide(store: PermissionStore, origin: string, permission: string, mediaTypes?: readonly string[]): Verdict {
  if (SILENT_ALLOW.has(permission) || origin.startsWith("file:")) return { kind: "allow" };
  const keys = permissionKeys(permission, mediaTypes);
  if (!keys.every((k) => k in ASK_LABEL)) return { kind: "deny" };
  if (!/^https?:\/\//.test(origin)) return { kind: "deny" };
  const saved = keys.map((k) => store[origin]?.[k]);
  if (saved.some((d) => d === "block")) return { kind: "deny" };
  if (saved.every((d) => d === "allow")) return { kind: "allow" };
  return { kind: "ask", keys, label: keys.map((k) => ASK_LABEL[k]).join(", ") };
}

/** 페이지가 권한 상태를 물을 때 (Notification.permission 등): 허용해 둔 것만 true */
export function isAllowed(store: PermissionStore, origin: string, permission: string, mediaType?: string): boolean {
  if (SILENT_ALLOW.has(permission) || origin.startsWith("file:")) return true;
  const keys = permission === "media" ? permissionKeys(permission, mediaType ? [mediaType === "audio" ? "audio" : "video"] : []) : [permission];
  return keys.every((k) => store[origin]?.[k] === "allow");
}

/** 답을 기억 (새 객체) */
export function remember(store: PermissionStore, origin: string, keys: string[], d: Decision): PermissionStore {
  const site = { ...store[origin] };
  for (const k of keys) site[k] = d;
  return { ...store, [origin]: site };
}

/** 파일에서 읽은 값 정리 (깨졌거나 모르는 값은 버림) */
export function parsePermissions(raw: unknown): PermissionStore {
  const out: PermissionStore = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [origin, perms] of Object.entries(raw as Record<string, unknown>)) {
    if (!perms || typeof perms !== "object") continue;
    const site: Record<string, Decision> = {};
    for (const [k, v] of Object.entries(perms as Record<string, unknown>)) if (v === "allow" || v === "block") site[k] = v;
    if (Object.keys(site).length) out[origin] = site;
  }
  return out;
}

/** 창에 보일 사이트 이름: https://gall.dcinside.com → gall.dcinside.com */
export const siteName = (origin: string) => origin.replace(/^https?:\/\//, "").replace(/:443$|:80$/, "");
