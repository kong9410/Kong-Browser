// document-start 에서 원본이 깜빡이지 않게 잠시 가린다. 엔진이 멈춰도 안전장치 타이머가 반드시 풀어준다.
const HIDE_ID = "kong-hide";
const SAFETY_MS = 2500;

let timer: ReturnType<typeof setTimeout> | undefined;

export function hideNow() {
  // document-start 의 아주 이른 시점에는 <html> 조차 없을 수 있다 → 생기는 즉시 다시 시도
  if (!document.documentElement) {
    new MutationObserver((_, obs) => {
      if (!document.documentElement) return;
      obs.disconnect();
      hideNow();
    }).observe(document, { childList: true });
    return;
  }
  if (document.getElementById(HIDE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_ID;
  style.textContent = "html { visibility: hidden !important; }";
  // document-start 시점에는 head 가 없을 수 있다
  (document.head ?? document.documentElement).appendChild(style);
  timer = setTimeout(reveal, SAFETY_MS);
}

export function reveal() {
  clearTimeout(timer);
  document.getElementById(HIDE_ID)?.remove();
}
