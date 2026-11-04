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
  // visibility: hidden 이 아니라 opacity: 0 으로: 가려진 동안 사이트 스크립트가 글자를 innerText 로 읽기 때문 (visibility 로 가리면 "" 가 됨).
  // 예) 에펨코리아는 본문의 유튜브 주소를 innerText 로 알아봐서 영상으로 바꾸는데, 가려져 있으면 못 알아봐 영상이 안 나왔다
  style.textContent = "html { opacity: 0 !important; pointer-events: none !important; }";
  // document-start 시점에는 head 가 없을 수 있다
  (document.head ?? document.documentElement).appendChild(style);
  timer = setTimeout(reveal, SAFETY_MS);
}

export function reveal() {
  clearTimeout(timer);
  document.getElementById(HIDE_ID)?.remove();
}
