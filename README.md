# Kong Browser

커뮤니티 사이트를 어디서 보든 **같은 화면**으로 보여주는 브라우저입니다.
사이트는 평소처럼 그대로 접속하고, 사이트별 **레시피**대로 원본 화면의 요소를 통일된 배치(왼쪽 메뉴 | 본문 | 오른쪽 열)로 옮겨 보여줍니다.
사이트 구조가 바뀌어 레시피가 맞지 않으면 원본 화면을 그대로 보여주고 고장을 기록합니다.

지원 사이트: 루리웹(PC·모바일), 디시인사이드(일반·마이너 갤러리)

## 구성

| 폴더 | 내용 |
|---|---|
| [desktop/](desktop/README.md) | PC 브라우저 앱 (Electron): 탭, 주소창, 북마크, 방문 기록, 원본 보기 |
| [transformer/](transformer/README.md) | 재배치 엔진 (TypeScript) + 레시피 개발 도구 (`browse`, `diagnose`, `snapshot`, `check`, `canary`) |
| [recipes/](recipes) | 사이트별 레시피 (선언형 JSON, 셀렉터만) |
| [docs/DESIGN.md](docs/DESIGN.md) | 설계, 결정 사항, 사이트 변경 대응, 마일스톤, 테스트 원칙 |

## 바로 실행

Node 20 이상 (Windows 기본 Edge 사용).

```bash
cd desktop && npm install && npm start
```

Windows 설치 파일은 `desktop` 에서 `npm run dist` → `desktop/release/`.

## 테스트

- 구현할 때: 단위 테스트
- 큰 작업을 마쳤을 때 또는 커밋 전에 한 번: 통합 테스트 (`desktop` 의 `npm run e2e`, `transformer` 의 `npm run check`)

자세한 내용은 [docs/DESIGN.md](docs/DESIGN.md) 12-1절.
