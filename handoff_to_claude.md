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

현재 워크플로우(캡처 -> 에디터 전달 -> 플레이어)의 뼈대는 뚫려 있으나, **데이터의 영구 보존 및 고도화**가 필요합니다.

1. **에디터 IndexedDB 연동 (우선순위 높음)**:
   - 현재 에디터는 새로고침 시 메모리에 있는 캡처본(Data URL)과 Step들이 날아갑니다. `idb` 또는 `localforage` 라이브러리를 사용해 수신된 Manifest 객체와 캡처된 이미지들을 브라우저 내장 IndexedDB에 영구 저장하도록 수정해 주세요.
2. **불투명 마스킹 UI 구현**:
   - 에디터의 화면 미리보기 영역에서 마우스로 영역을 드래그하여 불투명한 색상(개인정보 가림용) 박스를 덧씌우는 기능이 필요합니다.
3. **에디터 ↔ 공유 패키지 연동 강화**:
   - 편집기 상단 메뉴의 "안전 확인", "ZIP 내보내기" 버튼 로직을 구현하여 실제 `@walksim/player` 기반의 배포용 압축 파일이 완성되도록 마무리해야 합니다. (이때 이미지는 `jpeg`를 `webp`로 변환하여 압축하는 로직 추가)

## 4. 작업 시 주의사항 (Rules)
- **보안 최우선**: 개인정보 보호가 가장 중요합니다. 캡처된 원본 이미지는 절대 디스크 외부로 전송되면 안 됩니다.
- **포맷 제약**: 크롬 확장 API의 제약으로 임시로 `jpeg` 캡처를 사용 중입니다. 에디터에서 ZIP 내보내기를 할 때 `canvas.toBlob('image/webp')`을 통해 webp 변환을 적용해 주세요.
