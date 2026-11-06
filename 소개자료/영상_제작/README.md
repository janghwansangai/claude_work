# 소개 영상 만드는 법 (다시 만들 때)

`실습녹화기_소개영상.mp4`(1920×1080, 30fps, 약 2분 50초)는 실제 프로그램을 자동으로 조작하며 화면을 녹화해 만들었습니다.

| 파일 | 하는 일 |
|---|---|
| `script.json` | 장면별 낭독 문장(= 자막) |
| `site/index.html` | 녹화 예제로 쓴 가상의 ‘학급 누리집’ 회원가입 페이지(실제 개인정보 없음) |
| `rig.cjs`, `browser.cjs` | 가상 화면(Xvfb) 녹화(ffmpeg), 실제 마우스·키보드 조작(xdotool), 눌러야 할 버튼 강조 |
| `runA.cjs` | 촬영 A: 소개 사이트 → 크롬 확장 녹화 → 검수함 → 단계 편집 → 미리보기 → 안전 확인·ZIP → 학생 화면 |
| `runB.cjs` | 촬영 B: 데스크톱 앱(화면 녹화 시작, ↔ 따라 하기) |
| `cards/` | 처음·끝 제목 카드 |
| `tts_supertonic.py` | 한국어 더빙 — Supertonic-3(내 컴퓨터에서 도는 무료 음성 모델, 목소리 F1, OpenRAIL-M) |
| `build.py` | 장면 자르기·속도 맞춤, 강조 상자, 자막(Pretendard), 더빙 합치기 → H.264 MP4 + SRT |

순서: 연습용 사이트를 HTTPS로 띄우기(`https_serve.py`) → `node runA.cjs` → `node runB.cjs` → `node cards/render.cjs` → `python tts_supertonic.py F1` → `python build.py out/final.mp4`

필요한 것: Xvfb, xdotool, ffmpeg(libass), Playwright(Chromium), Noto Sans CJK·Pretendard 글꼴, `pip install supertonic`(첫 실행 때 Hugging Face에서 모델을 받음).
더빙 발음은 faster-whisper로 다시 받아 적어 확인했습니다(틀리게 들린 문장은 다시 만들거나 말을 바꿈).
