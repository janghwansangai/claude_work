import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Manifest } from '@walksim/shared';

// 모든 데이터는 브라우저 내장 IndexedDB(로컬 디스크)에만 저장된다.
// 캡처 원본은 개인정보가 포함될 수 있으므로 네트워크로 전송하는 코드를 이 모듈에 추가하지 말 것.

const DB_NAME = 'walksim-editor';
const DB_VERSION = 1;
const LAST_PROJECT_KEY = 'lastProjectId';

export interface ProjectRecord {
  id: string;
  manifest: Manifest;
  selectedStepId: string | null;
  updatedAt: number;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  blob: Blob;
  createdAt: number;
}

interface WalkSimDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
  };
  assets: {
    key: string;
    value: AssetRecord;
    indexes: { 'by-project': string };
  };
  meta: {
    key: string;
    value: string;
  };
}

let dbPromise: Promise<IDBPDatabase<WalkSimDB>> | null = null;

function getDB(): Promise<IDBPDatabase<WalkSimDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WalkSimDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        const assets = db.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('by-project', 'projectId');
        db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

// 저장된 데이터가 손상되었거나 다른 스키마 버전이면 무시한다.
function isUsableManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<Manifest>;
  return m.schemaVersion === 2 && typeof m.id === 'string' && Array.isArray(m.steps);
}

export async function loadLastProject(): Promise<ProjectRecord | undefined> {
  const db = await getDB();
  const projectId = await db.get('meta', LAST_PROJECT_KEY);
  if (!projectId) return undefined;
  const record = await db.get('projects', projectId);
  if (!record || !isUsableManifest(record.manifest)) return undefined;
  return record;
}

export async function loadProjectAssets(projectId: string): Promise<Record<string, Blob>> {
  const db = await getDB();
  const records = await db.getAllFromIndex('assets', 'by-project', projectId);
  return Object.fromEntries(records.map(r => [r.id, r.blob]));
}

export async function saveProject(manifest: Manifest, selectedStepId: string | null): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').put({ id: manifest.id, manifest, selectedStepId, updatedAt: Date.now() }),
    tx.objectStore('meta').put(manifest.id, LAST_PROJECT_KEY),
    tx.done,
  ]);
}

// 캡처 이미지와 그 이미지를 참조하는 Manifest를 한 트랜잭션으로 기록해,
// 중간에 새로고침되어도 "이미지 없는 단계"나 "단계 없는 이미지"가 남지 않도록 한다.
export async function saveCapture(
  manifest: Manifest,
  selectedStepId: string | null,
  assetId: string,
  blob: Blob,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
  const now = Date.now();
  await Promise.all([
    tx.objectStore('assets').put({ id: assetId, projectId: manifest.id, blob, createdAt: now }),
    tx.objectStore('projects').put({ id: manifest.id, manifest, selectedStepId, updatedAt: now }),
    tx.objectStore('meta').put(manifest.id, LAST_PROJECT_KEY),
    tx.done,
  ]);
}

// Manifest의 어떤 단계도 참조하지 않는 이미지를 삭제한다. 삭제한 개수를 반환한다.
export async function pruneOrphanAssets(manifest: Manifest): Promise<number> {
  const referenced = new Set(manifest.steps.map(s => s.assetId).filter(Boolean));
  const db = await getDB();
  const tx = db.transaction('assets', 'readwrite');
  const keys = await tx.store.index('by-project').getAllKeys(manifest.id);
  const orphans = keys.filter(k => !referenced.has(k));
  await Promise.all([...orphans.map(k => tx.store.delete(k)), tx.done]);
  return orphans.length;
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
  const assetKeys = await tx.objectStore('assets').index('by-project').getAllKeys(projectId);
  const lastId = await tx.objectStore('meta').get(LAST_PROJECT_KEY);
  await Promise.all([
    ...assetKeys.map(k => tx.objectStore('assets').delete(k)),
    tx.objectStore('projects').delete(projectId),
    lastId === projectId ? tx.objectStore('meta').delete(LAST_PROJECT_KEY) : Promise.resolve(),
    tx.done,
  ]);
}

// 브라우저가 저장 공간 부족 시 데이터를 임의로 지우지 않도록 영구 저장을 요청한다.
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// Data URL -> Blob. 로컬 디코딩만 수행하며 네트워크 요청은 발생하지 않는다.
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('유효하지 않은 Data URL입니다.');
  const [, mime = 'application/octet-stream', isBase64, data] = match;
  if (!isBase64) return new Blob([decodeURIComponent(data)], { type: mime });
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
