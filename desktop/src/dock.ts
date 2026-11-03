// 브라우저 오른쪽 dock 의 국내 주요 커뮤니티 (네이버 웨일의 사이드바처럼). Electron 없는 순수 데이터·함수
// 아이콘은 각 사이트의 /favicon.ico, 못 불러오면 첫 글자 배지(color)

export interface DockSite {
  name: string;
  url: string;
  /** 이 도메인(또는 하위 도메인)이면 "지금 이 사이트" 로 강조 */
  domain: string;
  /** 아이콘을 못 불러올 때 첫 글자 배지 색 */
  color: string;
}

export const DOCK_SITES: readonly DockSite[] = [
  { name: "루리웹", url: "https://bbs.ruliweb.com/", domain: "ruliweb.com", color: "#1e4fa3" },
  { name: "디시인사이드", url: "https://www.dcinside.com/", domain: "dcinside.com", color: "#3b4890" },
  { name: "에펨코리아", url: "https://www.fmkorea.com/", domain: "fmkorea.com", color: "#3f6ad8" },
  { name: "더쿠", url: "https://theqoo.net/", domain: "theqoo.net", color: "#58a0d8" },
  { name: "클리앙", url: "https://www.clien.net/service/", domain: "clien.net", color: "#5a6ea8" },
  { name: "뽐뿌", url: "https://www.ppomppu.co.kr/", domain: "ppomppu.co.kr", color: "#d84a3a" },
  { name: "인벤", url: "https://www.inven.co.kr/", domain: "inven.co.kr", color: "#e8590c" },
  { name: "MLB파크", url: "https://mlbpark.donga.com/", domain: "mlbpark.donga.com", color: "#2b6cb0" },
  { name: "오늘의유머", url: "https://www.todayhumor.co.kr/", domain: "todayhumor.co.kr", color: "#e8a20c" },
  { name: "보배드림", url: "https://www.bobaedream.co.kr/", domain: "bobaedream.co.kr", color: "#1a73e8" },
  { name: "웃긴대학", url: "https://web.humoruniv.com/", domain: "humoruniv.com", color: "#f0a020" },
  { name: "인스티즈", url: "https://www.instiz.net/", domain: "instiz.net", color: "#ff6f91" },
  { name: "네이트판", url: "https://pann.nate.com/", domain: "pann.nate.com", color: "#ff4d4d" },
  { name: "82쿡", url: "https://www.82cook.com/", domain: "82cook.com", color: "#7cb342" },
  { name: "SLR클럽", url: "https://www.slrclub.com/", domain: "slrclub.com", color: "#455a64" },
];

/** 주소가 dock 의 어느 사이트인지 (도메인이 같거나 그 하위 도메인). 없으면 null */
export function dockSiteOf(url: string, sites: readonly DockSite[] = DOCK_SITES): DockSite | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // 더 구체적인 도메인을 먼저 (mlbpark.donga.com 이 donga.com 보다 먼저 맞도록)
  const sorted = [...sites].sort((a, b) => b.domain.length - a.domain.length);
  return sorted.find((s) => host === s.domain || host.endsWith("." + s.domain)) ?? null;
}

export const faviconOf = (site: DockSite) => `${new URL(site.url).origin}/favicon.ico`;

/** dock 아이콘을 누른 방식 → 열 곳: 그냥 클릭 = 지금 탭, Ctrl/⌘+클릭·가운데 클릭 = 뒤쪽 새 탭 */
export const openTarget = (e: { button: number; ctrlKey: boolean; metaKey: boolean }): "current" | "background" =>
  e.button === 1 || e.ctrlKey || e.metaKey ? "background" : "current";
