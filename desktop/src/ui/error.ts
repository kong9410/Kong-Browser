// 오류 화면: 열지 못한 이유와 [다시 시도] (주소는 화면에 글자로만 보이고, 다시 시도는 http(s) 주소만)
import { errorInfo, failedUrlOf } from "../error-page";
import { displayLink } from "../link-status";

const ICONS: Record<string, string> = {
  offline: `<svg viewBox="0 0 24 24"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><path d="M12 19h.01M3 3l18 18"/></svg>`,
  cert: `<svg viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6z"/><path d="M12 8.5v4M12 16h.01"/></svg>`,
  crash: `<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8.5 10l2 2M10.5 10l-2 2M13.5 10l2 2M15.5 10l-2 2M9 16h6"/></svg>`,
  other: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 16h.01"/></svg>`,
};

const params = new URLSearchParams(location.search);
const code = Number(params.get("code") ?? 0);
const info = errorInfo(code, params.get("kind") === "crash" ? "crash" : undefined);
const url = failedUrlOf(location.href);

document.title = info.title;
document.getElementById("title")!.textContent = info.title;
document.getElementById("detail")!.textContent = info.detail;
document.getElementById("url")!.textContent = url ? displayLink(url, 300) : "";
document.getElementById("code")!.textContent = code ? `오류 코드 ${code}` : "";
const badge = document.getElementById("badge")!;
badge.innerHTML = ICONS[info.kind] ?? ICONS.other;
badge.classList.toggle("cert", info.kind === "cert");

const retry = document.getElementById("retry") as HTMLButtonElement;
retry.textContent = info.kind === "crash" ? "새로고침" : "다시 시도";
retry.hidden = !url;
retry.onclick = () => url && location.replace(url);
const back = document.getElementById("back") as HTMLButtonElement;
back.hidden = history.length < 2;
back.onclick = () => history.back();
