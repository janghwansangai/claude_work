#!/usr/bin/env bash
# 소개 사이트를 dist/ 로 모은다: 페이지 + 설명서 그림 + 설명서 PDF + 크롬 확장 + 체험용 예제 실습.
# 사용: bash website/build.sh   (결과: website/dist, 실습녹화기_최종본/4_소개사이트/실습녹화기-소개사이트.zip)
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
KIT="$ROOT/실습녹화기_최종본"
IMG="$KIT/1_설명서/images"
rm -rf dist && mkdir -p dist/img dist/files dist/demo
cp src/* dist/
cp src/_headers dist/_headers

copy_img() { cp "$IMG/$1" "dist/img/$2"; }
copy_img 03-검수함-가리기.jpg inbox-mask.jpg
copy_img 05-단계편집.jpg step-edit.jpg
copy_img 07-안전확인-문제.jpg safety.jpg
copy_img 10-학생-시작화면.jpg student-start.jpg
copy_img 11-학생-안내모드.jpg student-guide.jpg
copy_img 13-학생-완료.jpg student-done.jpg
copy_img 14-cloudflare-올리는곳.png cloudflare.png
copy_img 22-데스크톱-영역선택.jpg desktop-region.jpg
copy_img 23-데스크톱-도구막대.png desktop-toolbar.png

cp "$KIT/1_설명서/실습녹화기_사용설명서.pdf" dist/files/manual-ko.pdf
cp "$KIT/2_설치파일/실습녹화기-크롬확장.zip" dist/files/PracticeRecorder-Chrome-Extension.zip
cp "$KIT/3_예제/샘플_학생용_회원가입연습.zip" dist/files/sample-student-lesson.zip
cp "$KIT/3_예제/샘플_편집용_회원가입연습.walksim" dist/files/sample-project.walksim

# 체험: 예제 학생용 ZIP을 그대로 /demo/ 에 푼다(사이트 보안 헤더는 루트 _headers가 적용)
unzip -q "$KIT/3_예제/샘플_학생용_회원가입연습.zip" -d dist/demo
rm -f dist/demo/_headers dist/demo/README.txt

OUT="$KIT/4_소개사이트/실습녹화기-소개사이트.zip"
mkdir -p "$(dirname "$OUT")" && rm -f "$OUT"
(cd dist && zip -qrX "$OLDPWD/$OUT" .)
echo "built → website/dist ($(du -sh dist | cut -f1)), $OUT"
