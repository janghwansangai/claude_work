import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Manifest } from '@walksim/shared';

// 모든 데이터는 브라우저 내장 IndexedDB(로컬 디스크)에만 저장된다.
// PRD §7.2: 이 DB에는 "마스킹을 굽고 교사가 승인한 이미지"만 들어간다. 원본 캡처는 절대 저장하지 않는다.
// 네트워크로 전송하는 코드를 이 모듈에 추가하지 말 것.

const DB_NAME = 'walksim-editor';
const DB_VERSION = 2;
const LAST_PROJECT_KEY = 'lastProjectId';

export interface ProjectRecord {
  id: string;
  manifest: Manifest;
  selectedStepId: string | null;
  updatedAt: number;
}

export interface AssetRecord {
  projectId: string;
  assetId: string;
  blob: Blob; // 마스킹 완료 이미지(WebP, 미지원 시 PNG)
  width: number;
  height: number;
  createdAt: number;
}

interface WalkSimDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
  };
  assets: {
    key: [string, string];
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
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('meta');
        }
        // v1은 마스킹 전 원본 캡처를 저장했다(PRD 위반). 업그레이드 시 전부 폐기한다.
        if (db.objectStoreNames.contains('assets')) db.deleteObjectStore('assets');
        const assets = db.createObjectStore('assets', { keyPath: ['projectId', 'assetId'] });
        assets.createIndex('by-project', 'projectId');
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

export async function loadProjectAssets(projectId: string): Promise<AssetRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('assets', 'by-project', projectId);
}

/**
 * Manifest(와 새 자산)를 한 트랜잭션으로 저장하고, 어떤 단계도 참조하지 않는 자산은 같은 트랜잭션에서 삭제한다.
 * 중간에 새로고침되어도 "이미지 없는 단계"나 "주인 없는 이미지"가 남지 않는다.
 */
export async function saveProject(
  manifest: Manifest,
  selectedStepId: string | null,
  newAssets: AssetRecord[] = [],
): Promise<void> {
  const referenced = new Set(manifest.steps.map(s => s.assetId).filter(Boolean));
  const db = await getDB();
  const tx = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
  const assets = tx.objectStore('assets');
  const writes: Promise<unknown>[] = [
    ...newAssets.map(a => assets.put(a)),
    tx.objectStore('projects').put({ id: manifest.id, manifest, selectedStepId, updatedAt: Date.now() }),
    tx.objectStore('meta').put(manifest.id, LAST_PROJECT_KEY),
  ];
  const keys = await assets.index('by-project').getAllKeys(manifest.id);
  for (const key of keys) {
    if (!referenced.has(key[1])) writes.push(assets.delete(key));
  }
  await Promise.all([...writes, tx.done]);
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
