// 주소창 자동완성 목록 창의 preload: 그릴 후보를 받고, 누른 후보를 main 에 알린다
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./shared";
import type { Suggestion } from "./suggest";

contextBridge.exposeInMainWorld("kongSuggest", {
  onList: (fn: (list: Suggestion[], selected: number) => void) => ipcRenderer.on(IPC.suggestList, (_e, list, sel) => fn(list, sel)),
  choose: (url: string) => ipcRenderer.send(IPC.suggestChoose, url),
});
