# WalkSim 2.0 Handoff Document

> 이 문서는 이전 AI(제미나이)가 개발한 WalkSim 2.0의 Phase 0 ~ Phase 2 초기 구현 내용을 정리한 핸드오프 문서입니다. 클로드(Claude)는 이 문서를 바탕으로 아키텍처와 맥락을 이해하고 다음 작업을 이어서 진행해 주세요.

## 1. 프로젝트 개요 및 아키텍처
WalkSim 2.0은 학교 실습용 인터랙티브 웹 시뮬레이션 플랫폼입니다. 학생용은 서버 통신이 전혀 없는 정적(Static) 사이트여야 하며, 교사용 에디터는 개인정보 보호를 위해 로컬에서만 캡처 및 편집을 수행해야 합니다.

- **저장소 구조 (npm workspaces 기반 Monorepo)**
  - `packages/shared`: 공통 데이터 모델 및 Zod 스키마 (`Manifest`, `Step` 등)
  - `packages/player`: 학생용 정적 플레이어 (React + Vite + Tailwind)
  - `packages/editor`: 교사용 로컬 편집기 (React + Vite + Tailwind)
  - `packages/recorder`: 크롬 화면 녹화기 (MV3 Extension, esbuild)

## 2. 현재까지 구현 완료된 사항 (Completed)

### A. 공통 스키마 (`@walksim/shared`)
- `Manifest` (schemaVersion: 2) 및 `Step` (click, input, choice) Zod 스키마 정의 및 타입 익스포트.

### B. 학생용 정적 플레이어 (`@walksim/player` - Phase 1)
- `App.tsx`: `manifest.json`을 불러와 상태(`useState`) 기반으로 화면 전환 구현. 서버 통신 없음.
- `ViewportRenderer`: 캡처된 배경 이미지가 브라우저 해상도(DPR)나 창 크기에 상관없이 비율을 유지(`object-fit: contain`)하도록 계산.
- **반응형 핫스팟**: 0~1 사이로 정규화된 `rect` 배열 `[x, y, w, h]`를 브라우저의 실제 픽셀에 맞게 매핑하여 렌더링.
- `export:static` 스크립트 작성 완료 (빌드 후 `.zip` 패키징).

### C. 크롬 확장 프로그램 (`@walksim/recorder` - Phase 2.b)
- `manifest.json`: 권한 최소화를 위해 `activeTab`, `scripting` 권한만 사용.
- `popup.ts`: '녹화 시작' 클릭 시 활성 탭에만 `content.js` 주입.
- `content.ts`: `pointerdown` 이벤트를 가로채어 클릭된 요소의 위치를 뷰포트 대비 **정규화된 비율(0~1)**로 계산한 후 백그라운드로 전송.
- `background.ts`: `chrome.tabs.captureVisibleTab` (jpeg 포맷)을 통해 캡처 후, 로컬에 켜진 에디터 탭(`http://localhost:*`)을 찾아 통신.
- `editor-bridge.ts`: 에디터 탭에 주입되어 `window.postMessage`로 에디터 프런트엔드와 브릿지 통신.

### D. 교사용 로컬 편집기 (`@walksim/editor` - Phase 2.a)
- `App.tsx`: 사이드바(단계 목록) 및 중앙 작업 영역(미리보기, 지시사항 수정) 레이아웃 구성.
- **자동 동기화**: `message` 이벤트 리스너를 통해 확장 프로그램이 보낸 캡처 이미지(`Data URL`)와 핫스팟 좌표를 수신. 수신 즉시 새로운 Step을 자동 생성하고 이전 단계의 `nextStepId`와 연결.

## 3. 클로드가 이어서 해야 할 다음 작업 (Next Steps)

> 2026-09-26 Claude 개정 이후의 상태. 자세한 내용은 §5 참고.

1. **에디터 IndexedDB 연동** — ✅ 완료. 단, 최초 구현(원본 캡처 저장)은 PRD 결정 5·SEC-02 위반이라 **마스킹 완료 이미지만 저장**하도록 재작성함(DB v2가 v1 원본 자산을 폐기).
2. **불투명 마스킹 UI** — ✅ 완료. 검수함(메모리 전용) + 드래그 가림 상자 + 레코더 자동 후보 + 승인 시 픽셀에 굽기(WebP).
3. **"안전 확인" / "ZIP 내보내기"** — ✅ 완료. `packages/editor/src/export/exportZip.ts`
   - 차단 조건: 미승인 검수함, 이미지 없는 단계, 그래프 오류, 학생에게 보이는 텍스트 속 이메일·전화·주민번호·카드번호 형태. 통과 후 교사 최종 확인 체크 필수.
   - ZIP 구조: `index.html`(→ `play/<id>/` 이동) · `play/<id>/index.html` · `play/<id>/manifest.json`(자산 경로 `../../assets/…`) · `assets/img-<hash>.webp` · 플레이어 JS/CSS · `_headers` · `README.txt`. 샘플 실습(dummy) 제외.
   - 플레이어 빌드는 `build:extension`이 `recorder/dist/player/`에 함께 넣고 `files.json` 목록을 만든다. 따라서 내보내기는 **확장 안의 에디터에서만** 동작(localhost 개발 에디터는 안내 메시지).
4. **동작 종류 확장** — ✅ 완료 (2026-09-26): 더블클릭·오른쪽 클릭·끌어서 놓기·단축키·스크롤·입력칸 위치 입력·연습용 비밀번호·확대(zoom). shared 스키마·플레이어·에디터·크롬 녹화기 모두 반영.
5. **데스크톱 앱(Windows/macOS)** — ✅ 완료: `packages/desktop` (Electron). 영역 선택 → 전역 입력 훅(uiohook-napi) + 화면 스트림 메모리 버퍼로 동작 직전 화면 기록, Windows UI Automation으로 요소 상자·이름. 설치 파일은 `.github/workflows/walksim-build.yml`이 빌드.
   - Linux/Xvfb에서 실제 X11 입력으로 E2E 검증 완료. **Windows UIA와 macOS 권한 흐름은 실제 기기에서 확인 필요.**
6. 이후 후보: 프로젝트 JSON/ZIP 백업·불러오기(PRD P0, 확장 삭제 시 데이터 소실 대비), input/choice 단계 편집 UI, Playwright 테스트를 저장소에 정식 추가(QA-01).

## 4. 작업 시 주의사항 (Rules)
- **보안 최우선**: 개인정보 보호가 가장 중요합니다. 마스킹 전 원본 캡처는 **메모리(검수함)에만** 존재해야 하며 IndexedDB·localStorage·ZIP·로그·네트워크 어디에도 쓰면 안 됩니다.
- **포맷**: 레코더는 `jpeg`(품질 92)로 캡처하고, 에디터가 승인 시 마스킹을 구운 뒤 `canvas.toBlob('image/webp')`로 인코딩합니다(미지원 시 PNG).
- 원본 캡처는 WalkSim 에디터(확장 내부 페이지 또는 `<meta name="walksim-editor">`가 있는 개발용 localhost 페이지)에만 전달합니다.

## 5. 2026-09-26 Claude 검토·개정 요약

**판단**: 전체 아키텍처(정적 플레이어 + 로컬 에디터 + MV3 레코더 + IndexedDB)는 PRD·Arcade 방식 모두에 맞음. 아래 문제를 수정함.

| 문제 | 조치 |
|---|---|
| 원본 캡처가 IndexedDB에 저장됨(PRD 위반) | 검수함(메모리) → 가림 → 승인 시 마스킹된 WebP만 저장. DB v2 업그레이드가 v1 원본 삭제 |
| 클릭 **후** 비동기 캡처 → 결과 화면이 찍힘 | DOM 안정(400ms, 최대 2s) 시 미리 찍은 "클릭 직전 프레임" 사용. 비활성 탭은 활성화 시 보충 캡처 |
| 핫스팟이 `<span>` 등 내부 요소 크기로 잡힘 | 가장 가까운 버튼·링크·role 요소로 보정 |
| 캡처를 **아무 localhost 탭**에 `postMessage('*')`로 전송 | 확장 내부 에디터(chrome.runtime) 또는 표시된 개발용 에디터에만 전달 |
| 교사가 `npm run dev`를 띄워야 함 | 에디터를 확장 프로그램에 포함(`npm run build:extension`) |
| 페이지 이동 시 녹화 중단, 재시작 시 리스너 중복 | 이동 후 자동 재주입, 중복 방지, 상태는 `storage.session` |
| 에디터 미리보기 `aspect-video` 고정 → 핫스팟 어긋남 | 이미지 실제 비율로 오버레이 |
| 플레이어가 `manifest.viewport`로 비율 계산 → 실제 캡처 해상도와 불일치 | 이미지 natural size + ResizeObserver |
| 플레이어 매니페스트 경로 하드코딩, `alert()` 오답 처리 | `?lesson=`/`play/<id>/`, 매니페스트 기준 상대 경로, Arcade식 비콘·말풍선·오답 피드백·힌트·안내/연습/평가 모드 |
| shared가 CommonJS 빌드 필요 | TS 소스 직접 사용(빌드 단계 제거), 자산 경로 상대경로 강제, 그래프 검증 추가 |

**재현 절차**
- 교사용: `npm install && npm run build:extension` → `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `packages/recorder/dist`. 녹화할 탭에서 아이콘 → 더미 자료 확인 체크 → 녹화 시작 → 클릭 → 녹화 중지 → 자동으로 열린 에디터 검수함에서 가림·승인.
- 개발용 에디터: `npm run dev:editor` (확장 설치 상태에서 localhost 에디터로도 캡처 수신).
- 플레이어: `npm run dev:player` → `/?lesson=sample-drive&mode=guide`.

**테스트 결과(Playwright + Chromium, 수동 스크립트)**: 에디터(원본 미저장, 픽셀 마스킹 검증, 해시 중복 제거, 삭제 시 재연결·고아 자산 정리, v1→v2 원본 폐기, 다중 탭 잠금), 확장 E2E(클릭 직전 프레임, 버튼 스냅, 민감 후보 2곳 탐지, 페이지 이동 후 재주입, 종료 화면, 확장 내부 에디터 저장·복원), 플레이어(연습 모드 전 경로, 모바일 핫스팟 정합, 비-GET/외부 요청 0건) 모두 통과. 확장 E2E는 Playwright가 아이콘 클릭을 못 하므로 `activeTab` 대신 테스트용 host 권한으로 실행함.
