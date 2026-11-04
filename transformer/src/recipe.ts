// 레시피 스펙 v2 — 사이트별 "어디에 무엇이 있는지"만 담은 선언형 데이터. JS 는 담지 않는다.
// 설계: docs/DESIGN.md 5절

export const ENGINE_VERSION = 1;

/** 값 하나를 찾는 방법. sel 은 앞에서부터 처음 맞는 것을 사용한다. */
export interface Field {
  sel: string[];
  /** 텍스트 대신 이 속성값을 읽는다 (예: href) */
  attr?: string;
  /** 읽은 텍스트에 적용할 정규식. 첫 번째 캡처 그룹(없으면 전체 매치)을 값으로 쓴다 */
  pattern?: string;
  /** sel 로 찾은 요소 중 글자가 이 정규식에 맞는 것만 (예: 버튼 여러 개 중 "목록") */
  text?: string;
  /** 없으면 broken. 기본 false (없으면 degraded) */
  required?: boolean;
  /** move 되는 노드 안에서 숨길 요소 */
  exclude?: string[];
  /**
   * move 되는 노드 안에서 사이트 모양을 그대로 둘 부분 (통합 화면의 글꼴·색·크기 맞춤을 하지 않음).
   * 예) 디시 댓글의 디시콘·텍스트콘 (색 배경 + 흰 글자라 색을 맞추면 글자가 안 보인다)
   */
  raw?: string[];
  /** move 되는 노드 안에서 주 버튼으로 보일 것 (강조색). 예) 디시 댓글 쓰기 칸의 [등록] */
  primary?: string[];
  /**
   * move 할 때 사이트 모양 그대로 (통합 화면의 글꼴·색 맞춤을 하지 않고, 사이트 CSS 가 맞도록 원래 조상 껍데기로 감쌈).
   * 예) 디시 홈의 실북갤·흥한갤, 실시간 베스트 (keep.ts)
   */
  keepStyle?: boolean;
  /**
   * move 할 때 원래 조상 껍데기(속성 포함)로 감싼다. 모양은 통합 화면대로 두고, 사이트 스크립트가 조상에서 값을 찾을 수 있게.
   * 예) 디시 댓글 내용: 누르면 사이트가 조상 div.cmt_info 의 data-no 로 댓글을 찾아 답글 칸을 연다
   */
  context?: boolean;
}

export interface CommentSpec {
  /**
   * 사이트가 댓글 버튼 이벤트를 위임해 둔 상위 요소 (예: jQuery $(".comment_container").on("click", ".btn_like")).
   * 지정하면 이 요소를 통째로 뼈대로 옮기고 그 안에 댓글 목록을 만들어, 옮긴 버튼이 계속 동작하게 한다.
   */
  anchor?: string;
  /**
   * 댓글을 페이지 준비 뒤에 AJAX 로 불러오는 사이트 (디시 등). true 면 재배치 시점에 댓글이 0개여도 정상으로 보고,
   * 댓글 수 검산은 댓글이 실제로 붙은 뒤(observe) 한 번 더 한다.
   */
  lazy?: boolean;
  /** 일반 댓글 한 개 (문서 전체 기준) */
  item: string[];
  /** 베스트 댓글 한 개. 기능이 없는 사이트는 생략 */
  bestItem?: string[];
  /** item 자신 또는 내부에서 매칭되면 대댓글 */
  replyMarker?: string;
  who?: Field;
  /**
   * move. 사이트의 글쓴이 표시를 그대로 (닉네임 옆 아이콘·IP 포함). 있으면 who 글자 대신 쓴다.
   * 예) 디시 .gall_writer: 고닉·반고닉·매니저(주딱)·부매니저(파딱) 아이콘, 유동 IP, 댓글돌이
   */
  whoNode?: Field;
  when?: Field;
  /** move. item 기준 */
  content: Field;
  /** move. 댓글별 추천/신고 버튼 등. item 기준 */
  actions?: Field;
  /** move. 댓글 페이지 넘김/더보기 (문서 기준) */
  more?: Field;
  /**
   * move. 댓글을 눌렀을 때 사이트가 원본 댓글 목록(숨겨진 쪽)에 끼워 넣는 답글 쓰기 칸 (문서 기준).
   * 원본에서 바로 앞에 있는 댓글의 아래로 옮겨 보이고, 사이트가 닫으면(원래 자리를 지우면) 같이 사라진다
   */
  replyWrite?: Field;
}

export interface PostPage {
  id: string;
  type: "post";
  /** location.pathname + location.search 에 대한 정규식 */
  match: string;
  /** 이 페이지 유형이 맞는지 확인하는 표식. 전부 존재해야 함 */
  probe: string[];
  category?: Field;
  title: Field;
  author?: Field;
  createdAt?: Field;
  views?: Field;
  likes?: Field;
  /** move */
  body: Field;
  /** move. 글 추천 버튼 등 */
  actions?: Field;
  /** move. 남겨둘 광고 영역 */
  ad?: Field;
  /** move. 사이트의 원래 "목록" 버튼 (사이트의 기본 동작 그대로). 본문 아래, 댓글 위에 놓인다 */
  listLink?: Field;
  /** move. 사이트의 "글쓰기" 버튼. 목록 버튼 옆에 (글쓰기가 없는 게시판이면 생략, 경고 없음) */
  write?: Field;
  /** move. 사이트의 댓글 쓰기 칸(입력·등록 버튼). 댓글 목록 아래에 (댓글을 못 쓰는 글이면 생략, 경고 없음) */
  commentWrite?: Field;
  /** 검산용: 페이지에 표시된 일반 댓글 수 */
  commentCount?: Field;
  comments?: CommentSpec;
  /** 재배치 후에도 나중에 body 에 붙는 요소 중 숨길 것 (떠다니는 배너 등) */
  hide?: string[];
  /** 옮긴 내용 중 사이트의 고정 폭 배치가 통합 화면의 좁은 칸에 안 맞는 곳 (FitSpec) */
  fit?: FitSpec;
}

/**
 * 사이트가 고정 폭(px)으로 한 줄에 늘어놓은 것이 통합 화면 칸보다 넓어 줄이 넘어가는 곳을 칸에 맞춘다.
 * 나중에 붙는 요소(펼칠 때 불러오는 디시 이미지 댓글 등)에도 적용되도록 CSS 규칙으로 건다.
 * 예) 디시 이미지 댓글 한 줄(.addbox): 닉네임 152px + 글 550px + 날짜 → 날짜가 아래 줄로 떨어짐
 */
export interface FitSpec {
  /** 자식들을 한 줄로 (각자 내용 크기, 남은 폭은 fill 이 차지). 자식의 float 는 푼다 */
  row?: string[];
  /** 고정 폭과 float 를 풀어 남은 폭을 채운다 (row 안의 한 칸, 또는 옆의 float 요소 옆) */
  fill?: string[];
  /** 고정 폭 대신 부모 폭에 맞춘다 (width 100%, 최소 폭·좌우 여백 해제). 예) 디시 댓글 쓰기의 984px 글상자, 루리웹 안내 화면 */
  full?: string[];
  /** 좌우 안쪽 여백을 좁게 (16px). 사이트가 넓은 화면 기준으로 준 큰 여백. 예) 디시 글쓰기 칸 좌우 68px */
  tight?: string[];
  /** 위치 기준이 되지 않게 (position: static). right 와 함께: 더 바깥의 넓은 상자를 기준으로 */
  static?: string[];
  /** 고정 left 값(넓은 화면 기준) 대신 기준 상자의 오른쪽 끝에서 px 만큼 (left: auto, right: px). 예) 디시 에디터의 [HTML] 토글 */
  right?: { sel: string; px?: number }[];
}

export interface RowSpec {
  /** 게시글 목록 영역. item 은 이 안에서만 찾는다 */
  scope: string[];
  item: string[];
  category?: Field;
  title: Field;
  /** 기본 attr=href */
  link: Field;
  author?: Field;
  createdAt?: Field;
  views?: Field;
  likes?: Field;
  commentCount?: Field;
  /** item 이 공지 행이면 매칭 */
  notice?: string;
  /** item 자신 또는 내부에서 매칭되면 이미지가 있는 글 (사이트의 그림 아이콘 등) */
  image?: string;
  /** item 자신 또는 내부에서 매칭되면 동영상이 있는 글 */
  video?: string;
  /** 글 썸네일 이미지 (기본 attr=src). 있으면 목록 행 왼쪽에 작은 그림으로. 예) 디시 실시간 베스트 */
  thumbnail?: Field;
  /** 읽은 글 표시용: 글을 가리키는 쿼리 이름 (예: 디시 ["id", "no"]). 없으면 주소 경로만으로 같은 글인지 본다 */
  visitParams?: string[];
  /**
   * 읽은 글 표시용: 주소(경로+쿼리)에서 글 번호를 뽑는 정규식 (첫 캡처 그룹). 같은 글이 여러 주소로 열리는 사이트.
   * 예) 에펨코리아 /123, /best/123, /index.php?mid=best2&document_srl=123
   */
  visitPattern?: string;
  /**
   * 게시판을 식별하는 정규식 (첫 캡처 그룹). 현재 페이지 URL 과 각 행 링크에서 뽑은 값이 같아야 "이 게시판의 글".
   * 다른 게시판 글(사이드바, 인기글 등)이 목록에 섞였는지 검산한다. 예: "/board/([0-9]+)", "[?&]id=([^&]+)"
   */
  sameBoard?: string;
}

export interface BoardPage {
  id: string;
  type: "board";
  match: string;
  probe: string[];
  boardName?: Field;
  rows: RowSpec;
  /** move. 페이지 번호 */
  pager?: Field;
  /** move. 게시판 안 검색 (목록 아래, 페이지 번호 다음에 놓인다) */
  search?: Field;
  /** move. 사이트의 "글쓰기" 버튼. 게시판 제목 오른쪽에 (글쓰기가 없는 게시판이면 생략, 경고 없음) */
  write?: Field;
  /** move. "더보기" 버튼 (누르면 사이트가 원본 목록에 행을 추가 → 감시해서 반영) */
  more?: Field;
  hide?: string[];
}

/**
 * 게시판에 들어가기 전의 사이트 첫 화면 (또는 글쓰기 화면처럼 사이트 블록을 그대로 놓는 화면) (예: 루리웹 /ps, /nin). 뉴스·추천글 등 원본 내용은 숨기고,
 * 가운데 칸에는 제목과 광고만 남긴다. 메뉴·오른쪽 열은 다른 페이지와 같다.
 */
export interface HubPage {
  id: string;
  type: "hub";
  match: string;
  probe: string[];
  /** 화면 제목 (예: "PS5"). 없으면 제목 줄 없음 */
  title?: Field;
  /** move. 가운데 칸 맨 위 (예: 디시 홈의 "갤러리 & 통합검색") */
  top?: Field;
  /** move. 가운데 칸에 남길 사이트 내용 (예: 디시 홈의 실시간 베스트·개념글). 찾은 요소 전부를 문서 순서대로 */
  blocks?: Field;
  /** move. 가운데 칸에 남길 광고. 찾은 요소 전부를 문서 순서대로 옮긴다 */
  ads?: Field;
  hide?: string[];
  /** 옮긴 사이트 블록 중 고정 폭이 칸보다 넓은 곳 (FitSpec). 예) 디시 글쓰기 화면의 1020px 글쓰기 칸 */
  fit?: FitSpec;
}

export type Page = PostPage | BoardPage | HubPage;

/**
 * 통일 화면 왼쪽 메뉴 열에 놓을 사이트 메뉴 (설계 8-2절). 사이트 페이지의 메뉴 링크를 읽어 왼쪽 열에 다시 배치한다.
 * 루리웹: 상단 메뉴(PS5/XSX/PC…) + 게시판 메뉴(그룹 제목 + 하위 게시판) / 디시: 최근 방문 갤러리
 * 레시피에는 이 블록을 여러 개(menu 배열) 둘 수 있고, 위에서부터 순서대로 놓인다.
 */
export interface MenuSpec {
  /** 지금 위치 강조 방식: board = 같은 게시판(rows.sameBoard), prefix = 주소 경로가 링크로 시작 (상단 메뉴용), mark = 사이트 표시, none = 강조 안 함 (글 목록 등). 기본 board */
  current?: "board" | "prefix" | "mark" | "none";
  /** current 가 mark 일 때: 사이트가 지금 위치에 붙여 둔 표시 (예: 디시 상단 메뉴의 ".on"). 링크 자신이나 그 li 에서 찾는다 */
  mark?: string;
  /** 보여주는 모양: list = 세로 목록 (기본), chips = 짧은 항목을 여러 줄로 감싼 칩 (상단 메뉴용) */
  style?: "list" | "chips";
  /** 그룹 하나를 감싸는 요소 (문서 기준) */
  groups: string[];
  /** 그룹 기준 제목 요소. a 요소면 제목도 링크가 된다. 없으면 label 을 제목으로 */
  heading?: Field;
  /** heading 이 없을 때의 그룹 이름 (예: "최근 방문 갤러리") */
  label?: string;
  /** 그룹 기준 게시판 링크 (a) */
  links: string[];
  /** 링크 글자 (링크 기준). 없으면 링크 전체 글자 */
  linkText?: Field;
  /** 글자가 이 정규식에 맞는 링크는 뺀다 (예: 메뉴 끝의 "광고문의") */
  skip?: string;
}

/**
 * 통일 화면 오른쪽 열의 블록 하나 (설계 8-2절). 둘 중 하나:
 * - links: 사이트의 링크 목록을 읽어 통일된 모양으로 다시 그림 (예: 루리웹 게시판 BEST 글 목록)
 * - move: 사이트의 원래 요소를 그대로 옮겨 놓음. 버튼처럼 사이트 동작이 필요한 것 (예: 디시 전체글/개념글/공지, 말머리)
 * 페이지에 없으면 그 블록은 생략되고, 블록이 하나도 없으면 오른쪽 열 자체가 없다.
 */
export interface SideBlock {
  /** 블록 제목 (move 블록용. links 블록은 MenuSpec 의 heading/label) */
  title?: string;
  links?: MenuSpec;
  move?: Field;
  /** move 블록 안에서 숨겨져 있던 요소를 펼쳐 보일 것 (예: 디시 "말머리 더보기" 레이어) */
  reveal?: string[];
  /** move 블록 안에서 숨길 것 (예: 더보기 버튼) */
  hide?: string[];
}

export interface Recipe {
  schemaVersion: 2;
  host: string;
  version: number;
  minEngine: number;
  siteName: string;
  /** 사이트 맨 위의 로고 링크 (누르면 사이트 홈). 통합 화면 머리에 로고로 다시 그린다 */
  logo?: Field;
  /**
   * move. 사이트의 계정 영역(로그인 버튼 등). 맨 위 줄 오른쪽에, 로고 맞은편 (keepStyle 이면 사이트 모양 그대로).
   * 예) 디시 머리 오른쪽 위 링크 줄 (마이너갤 · … · 로그인 · 야간모드)
   */
  account?: Field;
  menu?: MenuSpec[];
  side?: SideBlock[];
  pages: Page[];
}

/** 레시피의 menu 를 읽은 결과 (왼쪽 메뉴 열에 그려진다) */
export interface MenuLink {
  text: string;
  href: string;
  /** 지금 보고 있는 게시판 */
  current: boolean;
}
export interface MenuGroup {
  title: string;
  style: "list" | "chips";
  href: string | null;
  current: boolean;
  links: MenuLink[];
}
export interface Menu {
  site: string;
  host: string;
  groups: MenuGroup[];
}

export type Verdict = "ok" | "degraded" | "broken" | "none";

export interface Status {
  verdict: Verdict;
  host: string;
  recipeVersion: number | null;
  pageId: string | null;
  /** broken 의 원인 (probe, 필수 필드명, engine, exception 등) */
  failed: string[];
  /** degraded 의 원인 (못 찾은 선택 필드, 검산 경고) */
  warnings: string[];
  engine: number;
  ms: number;
}
