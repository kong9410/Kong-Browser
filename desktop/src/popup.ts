// 사이트가 새 창을 열 때: 진짜 팝업 창으로 열지, 새 탭으로 열지 (Electron 없는 순수 함수)
// Chrome 과 같은 기준: window.open 에 크기·popup 같은 창 모양을 주면 팝업, 그 밖(target=_blank 링크 등)은 탭.
// 팝업은 여는 창(opener)과 연결된 채로 열려야 한다: 디시 에디터의 [이미지] 는
// window.open("/upload/image", "image", "width=606,height=498") 로 업로드 창을 열고, 업로드 창은 opener 가 없으면
// "잘못된 경로" 로 막는다.

/** setWindowOpenHandler 의 disposition 과 features */
export function isPopup(disposition: string, features: string): boolean {
  if (disposition === "background-tab" || disposition === "foreground-tab") return false;
  if (disposition === "new-window") return true;
  return /(^|,)\s*(width|height|popup|left|top)\s*(=|,|$)/i.test(features);
}

/** features 의 width/height (없으면 null). 팝업 창 크기 */
export function popupSize(features: string): { width: number; height: number } | null {
  const get = (k: string) => {
    const m = features.match(new RegExp(`(?:^|,)\\s*${k}\\s*=\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const width = get("width");
  const height = get("height");
  return width && height ? { width, height } : null;
}
