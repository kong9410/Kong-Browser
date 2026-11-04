// 페이지를 열지 못했을 때·페이지가 멈췄을 때 보여줄 오류 화면 (Electron 은 빈 화면만 보여준다)
// 오류 화면은 앱 안쪽 페이지 ui/error.html?kind=…&code=…&url=… 이고, 주소창에는 원래 열려던 주소가 보인다

export type ErrorKind = "network" | "offline" | "dns" | "cert" | "timeout" | "crash" | "other";

export interface ErrorInfo {
  kind: ErrorKind;
  title: string;
  detail: string;
}

/** Chromium 오류 번호(net_error_list) → 사용자에게 보일 말 */
export function errorInfo(code: number, kind?: "crash"): ErrorInfo {
  if (kind === "crash")
    return { kind: "crash", title: "페이지를 표시하는 중 문제가 생겼어요", detail: "페이지가 멈추거나 메모리가 부족했을 수 있어요. 새로고침하면 다시 열어요." };
  if (code === -106) return { kind: "offline", title: "인터넷에 연결되어 있지 않아요", detail: "네트워크 케이블이나 Wi-Fi 연결을 확인해 주세요." };
  if (code === -105 || code === -137) return { kind: "dns", title: "사이트 주소를 찾을 수 없어요", detail: "주소에 오타가 없는지 확인해 주세요." };
  if (code === -7 || code === -118) return { kind: "timeout", title: "사이트가 응답하는 데 너무 오래 걸려요", detail: "잠시 후 다시 시도해 주세요." };
  if (code <= -200 && code > -300)
    return { kind: "cert", title: "안전한 연결을 만들 수 없어요", detail: "이 사이트의 보안 인증서에 문제가 있어요. 개인 정보가 노출될 수 있어서 열지 않았어요." };
  if (code === -102) return { kind: "network", title: "사이트에서 연결을 거부했어요", detail: "사이트가 잠시 동작하지 않거나 주소가 바뀌었을 수 있어요." };
  if (code === -100 || code === -101 || code === -21 || code === -324)
    return { kind: "network", title: "연결이 끊어졌어요", detail: "네트워크가 바뀌었거나 사이트와의 연결이 끊어졌어요. 다시 시도해 주세요." };
  if (code === -109) return { kind: "network", title: "사이트에 연결할 수 없어요", detail: "네트워크 연결이나 방화벽 설정을 확인해 주세요." };
  if (code === -310) return { kind: "other", title: "페이지가 제대로 열리지 않아요", detail: "다른 주소로 너무 여러 번 넘어갔어요. 쿠키를 지우면 나아질 수 있어요." };
  if (code === -6) return { kind: "other", title: "파일을 찾을 수 없어요", detail: "파일이 옮겨졌거나 지워졌을 수 있어요." };
  return { kind: "other", title: "페이지를 열 수 없어요", detail: "잠시 후 다시 시도해 주세요." };
}

/** 이 실패는 오류 화면을 보여줄 만한가 (사용자가 멈춘 것(-3 ABORTED), 다운로드로 바뀐 것 등은 아님) */
export const showsErrorPage = (code: number) => code !== -3 && code !== 0 && code !== -27 /* BLOCKED_BY_RESPONSE 는 사이트 의도 */;

/** 오류 화면 주소 */
export function errorPageUrl(base: string, failedUrl: string, code: number, kind?: "crash"): string {
  const q = new URLSearchParams({ url: failedUrl, code: String(code) });
  if (kind) q.set("kind", kind);
  return `${base}?${q}`;
}

/** 오류 화면 주소면 원래 열려던 주소 (주소창 표시·새로고침용), 아니면 null */
export function failedUrlOf(url: string): string | null {
  if (!/^file:.*\/ui\/error\.html\?/i.test(url)) return null;
  try {
    const u = new URL(url).searchParams.get("url");
    return u && /^https?:\/\//i.test(u) ? u : null;
  } catch {
    return null;
  }
}
