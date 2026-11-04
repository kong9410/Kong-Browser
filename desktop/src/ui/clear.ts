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
/** 기간에 따라 쿠키·캐시가 무엇을 지우는지 안내 */
function notes() {
  const all = $<HTMLSelectElement>("since").value === "0";
  $("cookies-note").textContent = all
    ? "대부분의 사이트에서 로그아웃돼요."
    : "이 기간에 새로 생긴 쿠키와, 이 기간에 방문한 사이트의 저장 데이터를 지워요. 그 사이트에서 로그아웃될 수 있어요.";
  $("cache-note").textContent = all ? "사이트가 다음에 조금 느리게 열릴 수 있어요." : "이 기간에 방문한 사이트의 캐시를 지워요.";
}
$<HTMLSelectElement>("since").onchange = () => {
  notes();
  sync();
};
notes();

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
