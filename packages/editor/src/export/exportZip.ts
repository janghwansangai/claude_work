import { zipSync, strToU8 } from 'fflate';
import { validateManifest, validateManifestGraph, type Manifest, type Step } from '@walksim/shared';

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
export function scanTextForPii(manifest: Manifest): string[] {
  const findings: string[] = [];
  const check = (where: string, text: string) => {
    for (const [pattern, label] of PII_PATTERNS) if (pattern.test(text)) findings.push(`${where}에 ${label}로 보이는 글자가 있습니다.`);
  };
  check('제목', manifest.title);
  check('안내문', manifest.notice);
  manifest.steps.forEach((s, i) => stepTexts(s).forEach(t => check(`${i + 1}단계`, t)));
  return findings;
}

export function exportBlockers(manifest: Manifest, pendingInbox: number, missingImages: number): string[] {
  const blockers: string[] = [];
  if (pendingInbox > 0) blockers.push(`검수함에 승인되지 않은 캡처가 ${pendingInbox}개 있습니다.`);
  if (missingImages > 0) blockers.push(`이미지가 없는 단계가 ${missingImages}개 있습니다. 다시 녹화하거나 삭제하세요.`);
  blockers.push(...validateManifestGraph(manifest).errors, ...scanTextForPii(manifest));
  return blockers;
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
  files['README.txt'] = strToU8(
    `WalkSim 정적 실습 패키지\n\n` +
    `- 이 폴더 전체를 Cloudflare Pages(Direct Upload) 등 정적 웹호스팅에 올리면 됩니다.\n` +
    `- 학생 주소: https://<사이트>/play/${slug}/\n` +
    `- 파일을 더블클릭(file://)하면 동작하지 않습니다. 반드시 웹서버(HTTP/HTTPS)로 여세요.\n` +
    `  (PC에서 확인: 이 폴더에서 \`python3 -m http.server 8080\` 실행 후 http://localhost:8080 접속)\n`,
  );

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
