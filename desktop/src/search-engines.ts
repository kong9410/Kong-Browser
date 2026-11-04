// 검색 엔진 (설정에서 고름): 주소창에 주소가 아닌 말을 넣었을 때, 오른쪽 클릭 "○○ 에서 검색"

export const SEARCH_ENGINES = {
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  naver: { name: "네이버", url: "https://search.naver.com/search.naver?query=" },
  daum: { name: "다음", url: "https://search.daum.net/search?q=" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
} as const;

export type SearchEngineId = keyof typeof SEARCH_ENGINES;

export const searchUrl = (id: SearchEngineId, q: string) => SEARCH_ENGINES[id].url + encodeURIComponent(q);
