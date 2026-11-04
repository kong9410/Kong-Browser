// 웹페이지 preload: 페이지 스크립트보다 먼저(document-start), 격리된 world 에서 실행된다.
// transformer 엔진을 그대로 번들해 넣고, main 에서 레시피를 받아 kong.boot 를 호출한다.
import { contextBridge, ipcRenderer } from "electron";
import { boot } from "../../transformer/src/index";
import type { Recipe } from "../../transformer/src/recipe";
import { askLeave, installLeaveGuard } from "./leave-dialog";
import { showLinkStatus } from "./link-status";
import { allowCopy, installScrollButtons } from "./page-tools";
import { IPC, type InternalRequest, type PageConfig } from "./shared";

// 앱 안쪽 페이지(시작 페이지, 방문 기록, 북마크 관리)에만: 방문 기록·북마크 조회/편집 (main 도 보낸 쪽 주소를 다시 확인한다)
if (location.protocol === "file:" && /\/ui\/(start|history|bookmarks|downloads|clear|settings)\.html$/i.test(location.pathname)) {
  contextBridge.exposeInMainWorld("kongInternal", {
    call: (req: InternalRequest) => ipcRenderer.invoke(IPC.internal, req),
  });
}

// 엔진이 판정 결과와 왼쪽 메뉴 접힘 상태를 알리는 통로 (Android 의 @JavascriptInterface KongBridge 와 같은 역할)
window.KongBridge = {
  onStatus: (json) => ipcRenderer.send(IPC.pageStatus, json),
  onNav: (open) => ipcRenderer.send(IPC.pageNav, open),
};

if (window.top === window) {
  const config = ipcRenderer.sendSync(IPC.pageConfig, location.href) as PageConfig;
  const recipes = config.recipes as Recipe[];
  // 원본 보기가 아니면 재배치 (왼쪽 메뉴 열도 통일 화면의 일부)
  if (!config.off && recipes.length) boot(recipes, { navOpen: config.navOpen, visited: config.visited });
  // 커뮤니티 사이트: 오른쪽 클릭(이미지 저장·복사)과 글 복사를 막아 두었으면 푼다 (원본 화면에서도)
  if (recipes.some((r) => r.host === location.host)) allowCopy();
  // 맨 위/맨 아래 버튼은 모든 페이지에 (브라우저 기능)
  installScrollButtons();
  // 글쓰기 화면 등에서 '나가시겠어요?' 확인 창 (Electron 은 창 없이 이동을 막기만 하므로)
  installLeaveGuard();
  // 마우스 옆 버튼 뒤로/앞으로: Windows 는 main 이 창의 app-command 로 받으므로 그 밖의 운영체제에서만
  if (process.platform !== "win32")
    addEventListener("mouseup", (e) => {
      if (e.button === 3 || e.button === 4) ipcRenderer.send(IPC.pageHistory, e.button === 3 ? "back" : "forward");
    });
  // 링크에 마우스를 올리면 왼쪽 아래에 주소 (Chrome 의 상태 표시줄)
  ipcRenderer.on(IPC.linkStatus, (_e, url: string) => showLinkStatus(url));
  ipcRenderer.on(IPC.leaveAsk, () => askLeave(() => ipcRenderer.invoke(IPC.leaveGo)));
}
