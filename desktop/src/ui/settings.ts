// 설정 페이지: 바꾸면 바로 저장·반영 (저장 버튼 없음)
import type { SettingsView } from "../shared";
import { el, internal } from "./pages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const engine = $<HTMLSelectElement>("engine");
const unified = $<HTMLInputElement>("unified");
const dlDir = $("dl-dir");
const dlDefault = $<HTMLButtonElement>("dl-default");
const perms = $("perms");
const zooms = $("zooms");

function render(v: SettingsView | null) {
  if (!v) return;
  const s = v.settings;
  document.querySelectorAll<HTMLInputElement>('input[name="startup"]').forEach((r) => (r.checked = r.value === s.startup));
  unified.checked = !s.original;
  document.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((c) => (c.checked = !!s[c.dataset.key as keyof typeof s]));

  if (engine.options.length !== v.engines.length) engine.replaceChildren(...v.engines.map((e) => Object.assign(document.createElement("option"), { value: e.id, textContent: e.name })));
  engine.value = s.searchEngine;

  dlDir.textContent = v.downloadDir;
  dlDefault.hidden = !s.downloadDir;

  // 사이트 권한: 사이트마다 고른 권한, 허용/차단 바꾸기·지우기
  perms.replaceChildren();
  if (!v.permissions.length) perms.append(el("div", "empty", "아직 허용하거나 차단한 사이트가 없어요. 사이트가 알림·위치 등을 요청하면 여기에 남아요."));
  for (const p of v.permissions) {
    const row = el("div", "site");
    const list = el("div", "perms");
    for (const it of p.items) {
      const line = el("div", "perm");
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", `${p.site} ${it.label}`);
      sel.append(Object.assign(document.createElement("option"), { value: "allow", textContent: "허용" }), Object.assign(document.createElement("option"), { value: "block", textContent: "차단" }));
      sel.value = it.value;
      sel.onchange = async () => render(await internal.setPermission(p.origin, it.key, sel.value as "allow" | "block"));
      const del = el("button", "del", "×");
      del.title = "지우기 (다음에 다시 물어요)";
      del.setAttribute("aria-label", `${p.site} ${it.label} 지우기`);
      del.onclick = async () => render(await internal.setPermission(p.origin, it.key, null));
      line.append(el("span", "", it.label), sel, del);
      list.append(line);
    }
    row.append(el("div", "name", p.site), list);
    perms.append(row);
  }

  // 사이트별 확대/축소
  zooms.replaceChildren();
  if (!v.zooms.length) zooms.append(el("div", "empty", "100% 가 아닌 사이트가 없어요. Ctrl+휠이나 Ctrl+= / Ctrl+- 로 바꾸면 여기에 남아요."));
  for (const z of v.zooms) {
    const row = el("div", "site");
    const reset = el("button", "plain small", "기본으로");
    reset.onclick = async () => render(await internal.resetZoom(z.host));
    const right = el("div", "perm");
    right.append(el("span", "", z.percent), reset);
    row.append(el("div", "name", z.host), right);
    zooms.append(row);
  }

  $("version").textContent = `버전 ${v.version}`;
}

// 바꾸면 바로 저장
document.querySelectorAll<HTMLInputElement>('input[name="startup"]').forEach((r) => (r.onchange = async () => render(await internal.setSetting("startup", r.value))));
unified.onchange = async () => render(await internal.setSetting("original", !unified.checked));
document.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((c) => (c.onchange = async () => render(await internal.setSetting(c.dataset.key!, c.checked))));
engine.onchange = async () => render(await internal.setSetting("searchEngine", engine.value));
$<HTMLButtonElement>("dl-change").onclick = async () => render(await internal.chooseDownloadDir());
dlDefault.onclick = async () => render(await internal.setSetting("downloadDir", null));

// 왼쪽 목차: 지금 보이는 구역 표시
const links = [...document.querySelectorAll<HTMLAnchorElement>("#nav a")];
const sections = links.map((a) => document.querySelector<HTMLElement>(a.hash)!);
function markNav() {
  let cur = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top < 120) cur = s;
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = sections[sections.length - 1];
  links.forEach((a) => a.classList.toggle("on", a.hash === `#${cur.id}`));
}
addEventListener("scroll", markNav, { passive: true });
markNav();

// 다른 곳(툴바 토글 등)에서 바뀐 값도 보이게: 탭으로 돌아오면 다시 읽음
document.addEventListener("visibilitychange", async () => !document.hidden && render(await internal.settings()));
internal.settings().then(render);
