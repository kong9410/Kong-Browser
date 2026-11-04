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
  /**
   * 옮기지 않고 보이는 사본을 둔다 (mirror.ts). 사이트 스크립트가 내용을 써 넣은 iframe(src 없음)은 옮기면 빈 화면으로 다시 열리므로,
   * 그 문서를 스크립트 없는 사본(srcdoc + sandbox)으로 그린다. 링크는 새 창으로 열린다. 요소가 늦게 생기면 잠깐 기다렸다 그린다.
   * 예) 네이버 첫 화면 가로 광고 #ad_timeboard (React 안 + 스크립트가 쓴 iframe)
   */
  mirror?: boolean;
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
  /**
   * 대댓글 깊이 (댓글의 댓글의 댓글…). item 의 attr 값에서 pattern 첫 캡처 숫자를 step 으로 나눈 값이 깊이.
   * 예) 에펨코리아 style="margin-left:4%" → { attr: "style", pattern: "margin-left:\s*([0-9.]+)%", step: 2 } → 2단계.
   * base: 보통 댓글의 값 (예: 뮬은 보통 댓글이 이미 padding-left 20px → base 20, step 20 이면 40px 이 1단계).
   * 없으면 replyMarker 에 맞는 댓글은 1단계
   */
  depth?: { attr: string; pattern: string; step?: number; base?: number };
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

/** 글 아래 게시글 목록 (PostPage.list) */
export interface PostList {
  /** 행 스펙을 빌려 올 목록 화면의 id (같은 레시피의 board) */
  from: string;
  /** 행 스펙 중 글 화면에서 다른 것만 (예: 디시 글 아래 목록은 행 class 가 깨져 있고 data-type 이 없다) */
  rows?: Partial<RowSpec>;
  /** 쪽 넘김 (없으면 목록 화면 것). 글 화면에는 댓글 쪽 넘김도 있어 좁혀야 하는 경우 */
  pager?: Field;
  /** 게시판 검색 (없으면 목록 화면 것) */
  search?: Field;
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
  /** move. 제목 줄과 본문 사이 블록 (keepStyle 이면 사이트 모양 그대로). 예) 뮬 장터 글의 판매 정보 표(카테고리·가격·지역…) */
  info?: Field;
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
  /**
   * 글 아래 게시글 목록 (루리웹·디시·에펨코리아처럼 글 화면 아래에 그 게시판 목록이 있는 사이트). 댓글 아래에 목록 화면과 같은 모양으로.
   * from 의 목록 화면(board) 행 스펙·쪽 넘김·검색을 그대로 쓰고, 글 화면에서 다른 것만 덮어쓴다. 지금 보는 글 행은 강조. 행이 없으면 생략
   */
  list?: PostList;
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
  /** item 이 바로 위 행에 딸린 줄이면 매칭 → 들여서 그림. 예) 웃긴대학 답글 베스트: 글 줄 아래 그 글의 베스트 답글 줄 */
  reply?: string;
  /** item 자신 또는 내부에서 매칭되면 이미지가 있는 글 (사이트의 그림 아이콘 등) */
  image?: string;
  /** item 자신 또는 내부에서 매칭되면 동영상이 있는 글 */
  video?: string;
  /** 글 썸네일 이미지 (기본 attr=src). 있으면 목록 행 왼쪽에 작은 그림으로. 예) 디시 실시간 베스트 */
  thumbnail?: Field;
  /** 제목 아래에 한 줄로 더 보일 글자. 예) 에펨코리아 핫딜의 "쇼핑몰: 네이버 / 가격: 21,320원 / 배송: 무료" */
  extra?: Field;
  /** extra 뒤에 " · " 로 이어 붙일 칸들 (값이 있는 것만). 예) 뮬 장터의 가격 · 지역 */
  extras?: Field[];
  /**
   * 목록 머리에 "목록 | 갤러리" 전환을 둔다. 갤러리는 같은 행을 썸네일 카드로 (사이트마다 고른 것을 기억).
   * 예) 뮬 악기장터 — 사이트의 갤러리형 보기처럼. "on" 이면 처음에 갤러리 (원래 사진 격자인 게시판, 예: 웃긴대학 웃긴제목)
   */
  gallery?: boolean | "on";
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
  /**
   * 행 링크가 가는 곳. 기본 post(같은 사이트의 글 주소인지 검산). list 는 다른 목록(같은 레시피의 목록 화면 주소인지 검산).
   * 예) 웃긴대학 웹소설 첫 화면의 작품 줄 → 그 작품의 회차 목록
   */
  linksTo?: "post" | "list";
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
  /**
   * landing: 구글 첫 화면처럼 가운데 한 열에 큰 로고(hero) + top(검색창)만. 왼쪽 메뉴·오른쪽 열·본문 칸 테두리 없음 (설계 8-14절).
   * 예) 네이버 첫 화면
   */
  layout?: "landing";
  /**
   * landing 의 큰 로고 후보 (위에서부터 처음 찾은 것). 그림(img)이면 그 그림, 안에 인라인 SVG 가 있으면 복사, 아니면 사이트 이름 글자.
   * 누르면 그림의 이미지 맵 링크(두들) → 가장 가까운 링크 → 사이트 홈. 예) 네이버 두들 그림, 없는 날은 N 로고
   */
  hero?: Field;
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
  /** current 가 mark 일 때: 사이트가 지금 위치에 붙여 둔 표시 (예: 디시 상단 메뉴의 ".on"). 링크 자신이나 그 li·tr 에서 찾는다 */
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
  /**
   * 레시피에 적어 둔 고정 묶음 (제목 + 하위 링크). 사이트가 하위 메뉴를 일부 페이지에만 보여 주거나 링크 주소 없이(Vue 버튼) 두는 경우.
   * 예) 뮬 악기장터 → 뮬 악기장터 · 레코딩 · 삽니다 · 거래후기 (장터 첫 화면에만 있는 탭). groups 는 비워도 된다
   */
  fixed?: { title: string; href?: string; links: { text: string; href: string }[] }[];
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

/** 계정 영역 (Recipe.account) */
export interface AccountSpec extends Field {
  /**
   * 옮기지 않고 복사해 둔다 (원본이 바뀌면 다시 복사). React 가 그리는 칸처럼 요소를 떼어 가면 사이트가 다시 그릴 때 오류가 나는 경우.
   * 복사본은 사이트 이벤트가 없으므로 링크만 있는 칸에 쓴다. 예) 네이버 #account 의 로그인 링크
   */
  clone?: boolean;
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
  account?: AccountSpec;
  menu?: MenuSpec[];
  side?: SideBlock[];
  /**
   * 화면을 브라우저에서 그리는 사이트(Vue 등): 엔진이 돌 때 probe 가 아직 없으면 이 시간(ms)까지 기다렸다 다시 본다 (최대 2400).
   * 예) 뮬 — 서버는 틀과 데이터만 보내고 app.view.board() 가 목록을 그린다
   */
  waitFor?: number;
  /**
   * 사이트 팝업(로그인 창·사진 확대 등) 요소. 재배치할 때 원본 화면과 함께 숨기지 않고 body 바로 아래로 옮겨 그대로 보이게.
   * 예) 뮬 #modal(로그인·신고 창), .pswp(사진 확대) — 원본 화면 안에 미리 들어 있어 같이 숨던 것
   */
  overlays?: string[];
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
