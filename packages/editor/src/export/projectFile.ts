import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { validateManifest, type Manifest } from '@walksim/shared';
import { extensionForMime } from '../imaging';
import type { PendingMeta } from '../storage/pendingStore';

// 편집용 프로젝트 파일(.walksim). 교사가 다른 날·다른 컴퓨터에서 이어서 편집하기 위한 것이다.
// 승인된 이미지와 검수 전 캡처(원본)까지 들어 있으므로 학생에게 나눠 주는 ZIP과 다르다 — 공유하지 말 것.

const FORMAT = 'walksim-project';
const FORMAT_VERSION = 1;
const MAX_FILES = 2000;
const IMAGE_MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export interface ProjectAsset { assetId: string; blob: Blob; width: number; height: number }
export interface ProjectPending { blob: Blob; meta: PendingMeta }

interface ProjectJson {
  format: typeof FORMAT;
  formatVersion: number;
  savedAt: string;
  manifest: Manifest;
  selectedStepId: string | null;
  assets: { assetId: string; file: string; width: number; height: number }[];
  pending: { file: string; meta: PendingMeta }[];
}

export async function buildProjectFile(
  manifest: Manifest,
  selectedStepId: string | null,
  assets: ProjectAsset[],
  pending: ProjectPending[],
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const json: ProjectJson = { format: FORMAT, formatVersion: FORMAT_VERSION, savedAt: new Date().toISOString(), manifest, selectedStepId, assets: [], pending: [] };
  for (const a of assets) {
    const file = `assets/${a.assetId}.${extensionForMime(a.blob.type)}`;
    files[file] = new Uint8Array(await a.blob.arrayBuffer());
    json.assets.push({ assetId: a.assetId, file, width: a.width, height: a.height });
  }
  pending.forEach((p, i) => {
    json.pending.push({ file: `pending/${i + 1}.${extensionForMime(p.blob.type)}`, meta: p.meta });
  });
  await Promise.all(pending.map(async (p, i) => { files[json.pending[i].file] = new Uint8Array(await p.blob.arrayBuffer()); }));
  files['project.json'] = strToU8(JSON.stringify(json, null, 1));
  // 이미지는 이미 압축돼 있으므로 다시 압축하지 않는다(level 0)
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
}

export interface ParsedProject {
  manifest: Manifest;
  selectedStepId: string | null;
  assets: ProjectAsset[];
  pending: ProjectPending[];
}

// 다른 곳에서 받은 파일일 수 있으므로 형식·경로·이미지 종류를 모두 검사한다.
export async function parseProjectFile(file: File): Promise<ParsedProject> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('실습 녹화기 프로젝트 파일이 아닙니다. (학생용 ZIP이 아니라 ‘파일로 저장’한 .walksim 파일을 여세요)');
  }
  if (Object.keys(entries).length > MAX_FILES) throw new Error('파일이 너무 많습니다.');
  const raw = entries['project.json'];
  if (!raw) {
    throw new Error(entries['index.html']
      ? '학생용 ZIP은 편집용으로 열 수 없습니다. ‘파일로 저장’한 .walksim 파일을 여세요.'
      : '실습 녹화기 프로젝트 파일이 아닙니다.');
  }
  const json = JSON.parse(strFromU8(raw)) as Partial<ProjectJson>;
  if (json.format !== FORMAT || typeof json.formatVersion !== 'number') throw new Error('실습 녹화기 프로젝트 파일이 아닙니다.');
  if (json.formatVersion > FORMAT_VERSION) throw new Error('더 새로운 버전의 실습 녹화기에서 만든 파일입니다. 실습 녹화기를 업데이트하세요.');
  const manifest = validateManifest(json.manifest);

  const readImage = (path: string): Blob => {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const bytes = entries[path];
    if (!bytes || !IMAGE_MIME[ext] || path.includes('..')) throw new Error(`손상된 파일입니다: ${path}`);
    return new Blob([bytes as BlobPart], { type: IMAGE_MIME[ext] });
  };

  const assets = (json.assets ?? []).map(a => ({ assetId: String(a.assetId), blob: readImage(a.file), width: Number(a.width) || 0, height: Number(a.height) || 0 }));
  const pending = (json.pending ?? []).map(p => ({ blob: readImage(p.file), meta: sanitizeMeta(p.meta, IMAGE_MIME[p.file.split('.').pop()!.toLowerCase()]) }));
  const known = new Set(assets.map(a => a.assetId));
  for (const step of manifest.steps) {
    if (step.assetId && !known.has(step.assetId)) throw new Error('프로젝트 파일에 일부 이미지가 없습니다.');
  }
  return { manifest, selectedStepId: typeof json.selectedStepId === 'string' ? json.selectedStepId : null, assets, pending };
}

export function projectFileName(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${(title.trim() || '실습').replace(/[\\/:*?"<>|\s]+/g, '_')}-${date}.walksim`;
}

const isRect = (r: unknown): r is [number, number, number, number] =>
  Array.isArray(r) && r.length === 4 && r.every(n => typeof n === 'number' && Number.isFinite(n) && n >= -0.01 && n <= 1.01);

function sanitizeMeta(value: unknown, mime: string): PendingMeta {
  const m = (value ?? {}) as Partial<PendingMeta>;
  return {
    rect: isRect(m.rect) ? m.rect : null,
    viewport: m.viewport && typeof m.viewport.width === 'number' ? m.viewport : null,
    target: m.target && typeof m.target.tagName === 'string' ? { tagName: m.target.tagName.slice(0, 20), role: m.target.role?.slice(0, 20), label: m.target.label?.slice(0, 40) } : null,
    action: m.action && typeof m.action.kind === 'string' ? m.action : null,
    source: m.source === 'desktop' ? 'desktop' : 'browser',
    masks: Array.isArray(m.masks) ? m.masks.filter(isRect) : [],
    suggestedCount: Number(m.suggestedCount) || 0,
    instruction: typeof m.instruction === 'string' ? m.instruction.slice(0, 500) : '',
    timestamp: Number(m.timestamp) || Date.now(),
    mime,
  };
}
