import { zipSync, strToU8 } from 'fflate';
import { validateManifest, validateManifestGraph, type GraphIssue, type Manifest, type Step } from '@walksim/shared';

// PRD §12.2 안전한 정적 내보내기.
// ZIP에는 플레이어 + 검수된 manifest + 마스킹 완료 이미지(해시 파일명)만 들어간다.
// 원본 캡처·검수함·편집용 메타데이터는 절대 포함하지 않는다. 네트워크로 보내지 않고 교사 PC에 파일로만 저장한다.

const PII_PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/, '이메일 주소'],
  [/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/, '휴대전화 번호'],
  [/\b\d{6}[-\s]?[1-4]\d{6}\b/, '주민등록번호 형태'],
  [/\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/, '카드번호 형태'],
];

function stepTexts(step: Step): string[] {
  const texts = [step.instruction, step.hint ?? ''];
  if (step.type === 'input') texts.push(step.input.placeholder ?? '', ...step.input.acceptedValues);
  if (step.type === 'choice') texts.push(...step.choices.map(c => c.label));
  return texts;
}

// 학생에게 보이는 모든 텍스트에서 개인정보 형태를 찾는다(보조 검사 — 이미지 확인은 교사가 직접).
export function scanTextForPii(manifest: Manifest): GraphIssue[] {
  const findings: GraphIssue[] = [];
  const check = (text: string, where: string, step?: { id: string; n: number }) => {
    for (const [pattern, label] of PII_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({ level: 'error', stepId: step?.id, stepNumber: step?.n, message: `${step ? `${step.n}단계` : where}: ${label}로 보이는 글자가 있습니다.` });
      }
    }
  };
  check(manifest.title, '제목');
  check(manifest.notice, '안내문');
  manifest.steps.forEach((s, i) => stepTexts(s).forEach(t => check(t, '', { id: s.id, n: i + 1 })));
  return findings;
}

/** 내보내기 전 검사 결과. 단계와 관련된 문제는 stepId·stepNumber로 바로 찾아갈 수 있다. */
export function exportIssues(manifest: Manifest, pendingInbox: number, hasImage: (assetId: string) => boolean): GraphIssue[] {
  const issues: GraphIssue[] = [];
  if (pendingInbox > 0) issues.push({ level: 'error', message: `검수함에 승인되지 않은 캡처가 ${pendingInbox}개 있습니다. 승인하거나 버려 주세요.` });
  manifest.steps.forEach((s, i) => {
    if (s.assetId && !hasImage(s.assetId)) {
      issues.push({ level: 'error', stepId: s.id, stepNumber: i + 1, message: `${i + 1}단계: 이미지가 없습니다. 다시 녹화하거나 단계를 삭제하세요.` });
    }
  });
  const graph = validateManifestGraph(manifest).issues.filter(g => !(g.message.includes('배경 이미지 파일이 프로젝트에 없습니다') && g.stepId && !hasImage(manifest.steps[(g.stepNumber ?? 1) - 1]?.assetId ?? '')));
  issues.push(...graph, ...scanTextForPii(manifest));
  return issues;
}

async function fetchPlayerFiles(): Promise<Record<string, Uint8Array>> {
  const base = new URL('../player/', location.href);
  const listRes = await fetch(new URL('files.json', base)).catch(() => null);
  if (!listRes?.ok) {
    throw new Error('플레이어 파일을 찾을 수 없습니다. 확장 프로그램 안의 에디터에서 내보내 주세요. (개발 모드는 `npm run build:extension` 후 확장 에디터 사용)');
  }
  const paths: string[] = await listRes.json();
  const out: Record<string, Uint8Array> = {};
  for (const path of paths) {
    if (path.includes('..') || path.startsWith('/')) continue; // 내보내기 폴더 밖으로 벗어나는 경로 금지
    const res = await fetch(new URL(path, base));
    if (!res.ok) throw new Error(`플레이어 파일을 읽지 못했습니다: ${path}`);
    out[path] = new Uint8Array(await res.arrayBuffer());
  }
  return out;
}

export function lessonSlug(manifest: Manifest): string {
  return manifest.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+/, '').slice(0, 64) || 'lesson';
}

export async function buildLessonZip(manifest: Manifest, getImage: (assetId: string) => Blob | undefined): Promise<Blob> {
  const slug = lessonSlug(manifest);
  const files = await fetchPlayerFiles();
  const playerIndex = new TextDecoder().decode(files['index.html']);

  // 매니페스트는 play/<slug>/ 에 있으므로 자산 경로를 루트 기준으로 다시 쓴다.
  const assets: Record<string, string> = {};
  const used = new Set(manifest.steps.map(s => s.assetId).filter(Boolean));
  for (const assetId of used) {
    const path = manifest.assets[assetId];
    const blob = getImage(assetId);
    if (!path || !blob) throw new Error(`이미지를 찾을 수 없습니다: ${assetId}`);
    const fileName = path.split('/').pop()!;
    files[`assets/${fileName}`] = new Uint8Array(await blob.arrayBuffer());
    assets[assetId] = `../../assets/${fileName}`;
  }

  // 출력 직전 스키마 재검증(상대 경로만 허용 등)
  const published = validateManifest({ ...manifest, id: slug, assets });
  files[`play/${slug}/manifest.json`] = strToU8(JSON.stringify(published, null, 2));
  files[`play/${slug}/index.html`] = strToU8(playerIndex.replaceAll('"./', '"../../'));
  // 루트로 접속하면 이 실습으로 이동(인라인 스크립트 없이 — CSP script-src 'self' 호환)
  files['index.html'] = strToU8(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=play/${slug}/">` +
    `<title>${escapeHtml(manifest.title)}</title></head><body><a href="play/${slug}/">실습 시작하기</a></body></html>`,
  );
  // 윈도우 메모장에서도 한글이 깨지지 않도록 BOM + CRLF로 쓴다.
  files['README.txt'] = strToU8('\uFEFF' + deployReadme(slug, manifest.title).replace(/\n/g, '\r\n'));

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function deployReadme(slug: string, title: string): string {
  return `WalkSim 학생용 실습 — ${title}
==========================================

이 ZIP은 학생용 실습 웹사이트 전체입니다. 로그인·서버 없이 동작하고,
학생이 누르고 입력한 내용은 학생 기기에서만 처리되며 어디에도 저장·전송되지 않습니다.
원본 캡처는 들어 있지 않고, 가림이 적용된 이미지만 들어 있습니다.

※ ZIP이나 index.html을 더블클릭하면 동작하지 않습니다. 반드시 웹 주소로 여세요.

[1] 학생에게 나눠 주기 — Cloudflare (무료, 추천)
  1. https://dash.cloudflare.com 가입·로그인 (신용카드 불필요)
  2. 계정 홈 화면 가운데 "Ship something new" 칸 ("Drop a folder, or a zip")에
     이 ZIP 파일을 그대로 끌어다 놓고, 안내에 따라 배포(Deploy)합니다.
  3. 배포가 끝나면 https://무작위이름.내계정.workers.dev 같은 주소가 생깁니다.
     그 주소를 그대로 학생에게 주세요. 첫 화면이 실습으로 자동 이동합니다.
     (참고: 실습 페이지 위치는 주소 뒤 /play/${slug}/ 이지만, 학생에게는 기본 주소만 주면 됩니다)
  - QR 코드: 크롬에서 주소를 연 뒤 주소창 오른쪽 공유 아이콘 → QR 코드 만들기
  - 고쳤을 때: 에디터에서 다시 ZIP 내보내기 → 같은 칸에 새 ZIP 올리기 → 새 주소 안내
  - 올린 사이트 목록·삭제: Cloudflare 왼쪽 메뉴 "컴퓨트"
  - 화면이 바뀌었으면 계정 홈에서 "Drop a folder, or a zip" 또는 "Create app"을 찾으세요.

[2] 수업 모드 (주소 끝에 붙이면 바로 시작)
  ?mode=guide       안내 모드 — 누를 곳이 반짝이고 설명이 옆에 나옴
  ?mode=practice    연습 모드 — 2번 틀리면 힌트, 3번 틀리면 위치 공개
  ?mode=assessment  평가 모드 — 힌트 없음

[3] 수업 전날 확인
  - 시크릿 창으로 처음부터 끝까지 해 보기
  - 학생이 쓸 실제 기기와 학교 와이파이에서 열어 보기

[4] 인터넷에 올리지 않고 내 PC에서만 확인
  1. 이 ZIP 압축 풀기
  2. 압축 푼 폴더에서 터미널 열기 (Mac: 폴더 우클릭 → 폴더에서 새로운 터미널 열기 / Windows: 폴더 주소창에 cmd)
  3. python3 -m http.server 8080   (Windows는 python -m http.server 8080, Python 설치 필요)
  4. 브라우저에서 http://localhost:8080 열기 (끝낼 때 Ctrl+C)

[주의]
  - Cloudflare 주소(workers.dev 등)는 링크만 알면 누구나 볼 수 있는 공개 사이트입니다. 가상 자료만 올리세요.
  - 실습 입력칸에 실제 이름·비밀번호를 넣지 말라고 학생에게 안내하세요.
  - 내리려면: Cloudflare 왼쪽 메뉴 "컴퓨트"에서 해당 사이트를 열어 삭제
`;
}
