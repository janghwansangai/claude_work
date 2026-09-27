# WalkSim 2.0 — 학교 수업용 인터랙티브 모의 실습 만들기

선생님이 실제 프로그램을 조작하는 모습을 녹화하면, 학생이 **로그인·설치 없이** 똑같이 눌러 보며 연습하는 모의 실습 웹페이지가 만들어집니다(Arcade와 비슷한 방식).
학생 화면은 서버 없이 동작하고, 녹화 원본은 선생님 PC 밖으로 나가지 않습니다.

## 어떤 도구를 쓰나요?

| 가르칠 내용 | 도구 |
|---|---|
| 웹사이트 사용법, 사이트 가입하기 | **크롬 확장 프로그램** (입력칸·비밀번호 칸 자동 인식, 개인정보 후보 자동 가림) |
| 윈도우 사용법, 브라우저 자체(탭·주소창·설정), 한글·엑셀, 유니티 등 모든 프로그램 | **WalkSim 데스크톱 앱** (Windows / macOS) |

두 도구 모두 같은 편집기가 들어 있고, 결과물(학생용 ZIP)도 같습니다.

## 설치

### 데스크톱 앱 (Windows / macOS)
1. GitHub 저장소의 **Actions** 탭 → 가장 최근 **WalkSim build** 실행 → 아래 **Artifacts**에서 내려받습니다.
   - Windows: `WalkSim-Windows` → `WalkSim-Setup-x.y.z.exe` 실행
   - Mac: `WalkSim-macOS` → Apple Silicon(M1 이후)은 `…mac-arm64.dmg`, 인텔 맥은 `…mac-x64.dmg`
2. 처음 설치할 때 경고가 뜹니다(유료 인증서 없이 배포하기 때문).
   - Windows "PC 보호": **추가 정보 → 실행**
   - Mac "확인되지 않은 개발자": 앱을 **우클릭 → 열기**. 그래도 안 되면 터미널에서 `xattr -cr /Applications/WalkSim.app`
   - Mac은 반드시 **WalkSim을 응용 프로그램 폴더로 끌어다 놓고 그곳에서 실행**하세요. DMG 창에서 바로 실행하면 화면 기록 권한이 유지되지 않습니다(앱이 옮기기를 제안합니다).
3. Mac은 처음 녹화할 때 **화면 기록**, **손쉬운 사용(입력 모니터링)** 권한을 켜야 합니다(앱이 안내합니다). 권한을 켠 뒤 앱을 다시 실행하세요.
   - **새 버전을 설치한 뒤 설정에 켜져 있는데도 권한 안내가 계속 뜨면**: 서명 없는 앱이라 macOS가 예전 버전에 준 권한을 새 앱에 적용하지 않은 것입니다. 안내 창의 **‘권한 다시 설정’**을 누르면 예전 기록을 지우고 앱이 다시 시작됩니다. 그다음 녹화를 시작해 권한을 다시 허용하세요.
   - **설정 목록에 WalkSim이 없으면**: 목록 아래 「+」 → 응용 프로그램 → WalkSim을 추가하고 켠 뒤 WalkSim을 다시 실행하세요. (또는 안내 창의 ‘그래도 녹화 시도’를 한 번 누르면 macOS가 목록에 올리고 허용 요청을 띄웁니다.)
     (직접 하려면: 설정 목록에서 WalkSim을 「−」로 지우거나, 터미널에서 `tccutil reset ScreenCapture app.walksim.desktop`, `tccutil reset Accessibility app.walksim.desktop`, `tccutil reset ListenEvent app.walksim.desktop`)

### 크롬 확장 프로그램
1. Actions의 `WalkSim-Chrome-Extension` 아티팩트를 내려받아 압축을 풉니다.
   (직접 빌드: 저장소 루트에서 `npm install && npm run build:extension` → `packages/recorder/dist`)
2. 크롬 주소창에 `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기 → **압축해제된 확장 프로그램 로드** → 압축 푼 폴더 선택

## 실습 만들기

1. **녹화**
   - 데스크톱 앱: 왼쪽 **● 화면 녹화 시작** → 녹화할 영역을 드래그(또는 전체 화면) → 평소처럼 조작 → 도구 막대의 **중지**
     (단축키: `Ctrl/⌘+Shift+F8` 일시정지, `Ctrl/⌘+Shift+F9` 중지)
   - **모니터가 여러 대**이면 모든 모니터에 선택 화면(왼쪽 위에 "모니터 1 / 2" 표시)이 뜹니다. 녹화할 모니터에서 영역을 드래그하거나 그 모니터의 ‘전체 화면 녹화’를 누르세요. 다른 모니터에서 한 클릭은 기록되지 않습니다.
   - 크롬 확장: 녹화할 탭에서 WalkSim 아이콘 → 체크 → **이 탭 녹화 시작** → 조작 → **녹화 중지**
2. **검수함**에서 캡처마다 개인정보를 검은 상자로 가리고 **승인**합니다. 원본은 승인 전까지 메모리에만 있고, 가림이 적용된 이미지만 저장됩니다.
3. **단계 편집**: 지시문·힌트 수정, 클릭 영역 조정, 동작 종류 변경(클릭·더블클릭·오른쪽 클릭·끌어서 놓기·글자 입력·단축키·스크롤·선택지), 확대 영역 지정.
4. **ZIP 내보내기** → 자동 검사 통과 후 최종 확인 → `walksim-제목.zip`

녹화되는 동작: 클릭, 더블클릭, 오른쪽 클릭, 끌어서 놓기, 글자 입력(**입력한 내용은 기록하지 않음**), 단축키(Ctrl과 ⌘는 같은 키로 인정), 스크롤.

## 학생에게 배포

ZIP 파일을 더블클릭해서는 열리지 않습니다. 웹서버에 올려야 합니다.
- **Cloudflare Pages(무료)**: dash.cloudflare.com → Workers & Pages → Create → Pages → **Upload assets** → 프로젝트 이름 입력 → ZIP 끌어다 놓기 → Deploy
- 학생 주소: `https://<프로젝트>.pages.dev` (QR 코드: 크롬 공유 메뉴 → QR 코드 만들기)
- 수정 후에는 같은 프로젝트에서 **Create deployment**로 새 ZIP을 올리면 주소는 그대로입니다.
- 공개 링크이므로 **가상 자료만** 올리세요.

학생은 **안내 / 연습 / 평가** 모드 중 하나를 골라 실습합니다. 결과는 학생 기기 화면에만 보이고 어디에도 저장·전송되지 않습니다.

## 개발자용

```bash
npm install
npm run dev:editor      # 편집기 (localhost, 크롬 확장 설치 시 캡처 수신)
npm run dev:player      # 학생 플레이어 (?lesson=step-types 로 모든 동작 예시)
npm run dev:desktop     # 데스크톱 앱 실행
npm run build:extension # 크롬 확장(편집기·플레이어 포함) → packages/recorder/dist
npm test                # 데스크톱 녹화 로직 단위 테스트
```

| 패키지 | 역할 |
|---|---|
| `packages/shared` | 실습 데이터 형식(Zod 스키마), 연결 검사, 단축키 처리 |
| `packages/player` | 학생용 정적 플레이어 |
| `packages/editor` | 교사용 편집기(검수함·가림·단계 편집·ZIP 내보내기) |
| `packages/recorder` | 크롬 확장 녹화기(+편집기 포함) |
| `packages/desktop` | Electron 데스크톱 녹화기(+편집기 포함) |

설계 배경은 `WalkSim_PRD_v2.md`, 작업 이력은 `handoff_to_claude.md` 참고.
