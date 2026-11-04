// 페이지 위에 겹쳐 뜨는 작은 창(찾기 막대·권한 묻기)의 preload: main 과 메시지만 주고받는다
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type OverlayIn, type OverlayOut } from "./shared";

contextBridge.exposeInMainWorld("kongOverlay", {
  on: (fn: (m: OverlayIn) => void) => ipcRenderer.on(IPC.overlayIn, (_e, m: OverlayIn) => fn(m)),
  send: (m: OverlayOut) => ipcRenderer.send(IPC.overlayOut, m),
});
