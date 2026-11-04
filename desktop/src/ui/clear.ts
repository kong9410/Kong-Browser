// 인터넷 사용 기록 삭제 (Ctrl+Shift+Delete): 기간과 지울 것을 골라 삭제
import type { ClearWhat } from "../shared";
import { internal } from "./pages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const keys: (keyof ClearWhat)[] = ["history", "downloads", "cookies", "cache", "siteSettings"];
const go = $<HTMLButtonElement>("go");
const done = $("done");

const picked = (): ClearWhat => Object.fromEntries(keys.map((k) => [k, $<HTMLInputElement>(k).checked])) as unknown as ClearWhat;
const sync = () => {
  go.disabled = !keys.some((k) => $<HTMLInputElement>(k).checked);
  done.hidden = true;
};
for (const k of keys) $<HTMLInputElement>(k).onchange = sync;
$<HTMLSelectElement>("since").onchange = sync;

go.onclick = async () => {
  const range = Number($<HTMLSelectElement>("since").value);
  go.disabled = true;
  go.textContent = "삭제하는 중…";
  await internal.clearData(range ? Date.now() - range : 0, picked());
  go.textContent = "삭제";
  go.disabled = false;
  done.hidden = false;
};
sync();
