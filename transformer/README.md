# transformer — 재배치 엔진 + 레시피 개발 도구

사이트를 그대로 연 뒤, `recipes/<host>.json` 레시피대로 원본 요소를 통일된 뼈대(`#kong-root`)로 옮기는 엔진입니다.
같은 번들(`dist/transformer.js`)을 Android 앱 WebView 와 이 개발 도구가 똑같이 씁니다. 설계는 [docs/DESIGN.md](../docs/DESIGN.md).

## 준비

Node 20+, Windows 기본 Edge (다른 브라우저는 `BROWSER_CHANNEL=chrome`).
모든 명령은 기본이 PC 화면이고, `--mobile` 을 붙이면 폰 화면(Pixel 7) 에뮬레이션입니다.

```bash
npm install
```

## 명령

개발용 브라우저 (모든 페이지에 엔진 주입). 레시피나 `src/` 를 저장하면 자동으로 다시 빌드해서 새로고침합니다. 터미널에 페이지마다 판정(ok/degraded/broken)이 찍힙니다.

```bash
npm run browse -- "https://bbs.ruliweb.com/community/board/300143"
```

진단: 레시피의 필드마다 무엇을 찾았는지 표 + 판정 + 원본/재배치 스크린샷(`out/`). 사이트가 바뀌어 깨졌을 때 원인 찾기용입니다.

```bash
npm run diagnose -- "https://bbs.ruliweb.com/mobile/board/300008/read/2296589"
```

단위 테스트: 엔진 함수(탐지·판정·메뉴 읽기)를 가짜 DOM(happy-dom)에서 검사합니다. 실제 브라우저 없이 1초 안쪽.

```bash
npm test
```

### 사이트 변경 대응 도구 (설계 7절)

스냅샷 모으기: 판정이 ok 인 페이지의 HTML 을 `snapshots/<host>/` 에 저장합니다. 개발 PC 에만 두고 git/서버에는 올리지 않습니다. 이미지 글, 동영상 글, 댓글 없는 글, 댓글 많은 글처럼 다양하게 모아 두세요.

```bash
npm run snapshot -- --board "https://gall.dcinside.com/board/lists/?id=programming" --count 10
```

회귀 검사: 레시피를 고친 뒤, 모아 둔 스냅샷 전부에서 여전히 동작하는지 확인합니다. 네트워크도 사이트 JS 도 없이 돌아서 빠르고 결과가 매번 같습니다. 실패가 있으면 종료 코드 1.

```bash
npm run check
```

카나리 (개발자용, 선택): `canary.json` 의 게시판과 최신 글 5개씩을 실제로 열어 판정합니다. 변경 감지는 원래 **앱이 페이지를 열 때마다** 하므로 사용자에게는 필요 없고, 아무도 방문하지 않은 날에도 미리 알고 싶을 때 개발자가 쓰는 보조 도구입니다. 결과는 `out/canary-*.json`(앱과 같은 보고 형식), 고장이 있으면 종료 코드 1.

```bash
npm run canary
```

원하면 개발자 PC 의 Windows 작업 스케줄러에 등록해 매일 돌릴 수 있습니다 (예: 매일 오전 9시). 알림 채널은 M4 에서 정합니다.

```bash
schtasks /Create /SC DAILY /ST 09:00 /TN "KongCanary" /TR "cmd /c cd /d C:\workspace\kong-browser\transformer && npm run canary >> out\canary.log 2>&1"
```

**사이트가 바뀌어 깨졌을 때 고치는 순서:** `canary`/앱 보고로 발견 → `diagnose <url>` 로 어느 필드가 왜 실패했는지 확인 → 레시피의 `sel` 배열 **앞에** 새 셀렉터 추가 → `browse` 로 눈으로 확인 → `check` 로 예전 스냅샷까지 통과 확인 → 새 페이지를 `snapshot` 으로 추가.

### 빌드

앱에 넣을 번들 만들기 → `dist/transformer.js`

```bash
npm run build
```

## 구조

| 파일 | 역할 |
|---|---|
| `src/recipe.ts` | 레시피 스펙 v2 타입, `ENGINE_VERSION` |
| `src/hide.ts` | document-start 가림 + 2.5초 안전장치 |
| `src/locate.ts` | ① 탐지 (DOM 변경 없음) |
| `src/judge.ts` | ② 판정 ok / degraded / broken + 검산 |
| `src/layout.ts` | ③ 뼈대 생성, 원본 노드 이동, 원본 숨김 |
| `src/observe.ts` | ⑤ 늦게 붙는 댓글, 더보기 행, 댓글 페이지 교체 반영 |
| `src/style.css` | 모든 사이트 공통 통일 화면 (라이트/다크) |
| `src/index.ts` | `kong.boot(레시피들)` / `run` / `inspect` |
| `src/menu.ts` | 레시피의 `menu` 블록대로 사이트의 메뉴 링크를 읽음 |
| `src/nav.ts` | 통일 화면을 최대 세 열(grid)로: 왼쪽 메뉴(.k-nav, 접기/펼치기) + 본문(.k-main) + 오른쪽 열(.k-side) |
| `src/report.ts` | 고장 보고 형식 (콘텐츠 없음, 글 번호 가림, 1시간 중복 억제) |
| `cli/` | `browse`, `diagnose`, `snapshot`, `check`, `canary`, `build` |
| `canary.json` | 카나리가 점검할 게시판 목록 |

## 레시피 작성 팁

- 필드의 `sel` 은 배열입니다. 사이트가 바뀌면 새 셀렉터를 **앞에** 추가하고 옛 것은 남겨 두세요.
- 댓글을 페이지 로드 뒤 AJAX 로 불러오는 사이트(디시 등)는 `comments.lazy: true`. 재배치 시점에 댓글이 0개여도 정상으로 보고, 댓글이 붙은 뒤 개수를 검산합니다.
- 버튼이 옮긴 뒤 동작하지 않으면 사이트가 이벤트를 상위 요소에 위임한 경우입니다. 브라우저 콘솔에서 `jQuery._data(요소, "events")` 로 어디에 붙어 있는지 찾아 `comments.anchor` 로 지정하세요.
- 버튼이 여러 개 있는 곳에서 하나만 고를 때는 Field 의 `text`(글자 정규식). 예: `"listLink": { "sel": [".btn_wrapper a"], "text": "^목록$" }`
- 왼쪽 메뉴 열은 레시피 최상위 `menu` 배열. 블록마다 groups / heading / label / links / linkText, 강조 방식 `current`(board = 같은 게시판, 목록 페이지의 `rows.sameBoard` 로 판단 / prefix = 주소 경로가 링크로 시작 / mark = 사이트가 붙여 둔 표시 `mark`(예: `.on`)를 그대로 따름), 모양 `style`(list / chips), 뺄 링크 `skip`(글자 정규식).
- 오른쪽 열은 레시피 최상위 `side` 배열. `links` 블록(링크를 읽어 다시 그림, 메뉴와 같은 형식, 글 목록은 `current: "none"`) 또는 `move` 블록(사이트 요소를 그대로 옮김. 버튼처럼 사이트 동작이 필요할 때. `reveal` 로 숨은 레이어를 펼치고 `hide` 로 감춤).
- `npm run diagnose` 의 `judgement` 가 ok 가 될 때까지 고치면 됩니다.
