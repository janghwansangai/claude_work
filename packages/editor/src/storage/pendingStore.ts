import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Rect } from '@walksim/shared';
import type { CaptureTarget, RecordedAction, Viewport } from '../project';

// 검수 전 캡처 임시 보관함.
// 원본 캡처는 개인정보가 담겼을 수 있으므로(PRD §7.2) 평문으로 저장하지 않는다.
//  - 이미지와 편집 정보를 AES-GCM 256비트로 암호화해 저장한다.
//  - 암호화 키는 데스크톱 앱에서는 운영체제 보안 저장소(Windows DPAPI / macOS 키체인)로 감싸 두고,
//    크롬 확장에서는 브라우저 밖으로 꺼낼 수 없는(non-extractable) 키로 둔다.
//  - 7일이 지나면 검수하지 않았더라도 자동으로 지운다.
// 네트워크로 보내는 코드를 이 모듈에 추가하지 말 것.

export const PENDING_TTL_DAYS = 7;
const TTL_MS = PENDING_TTL_DAYS * 24 * 60 * 60 * 1000;
const DB_NAME = 'walksim-pending';

export interface PendingMeta {
  rect: Rect | null;
  viewport: Viewport | null;
  target: CaptureTarget | null;
  action: RecordedAction | null;
  source: 'browser' | 'desktop';
  masks: Rect[];
  suggestedCount: number;
  instruction: string;
  timestamp: number;
  mime: string;
}

interface PendingRecord {
  id: string;
  createdAt: number;
  expiresAt: number;
  imageIv: Uint8Array;
  image: ArrayBuffer;
  metaIv: Uint8Array;
  meta: ArrayBuffer;
}

interface KeyRecord {
  id: 'main';
  key?: CryptoKey;       // 크롬 확장: 꺼낼 수 없는 키
  wrapped?: string;      // 데스크톱: 운영체제 보안 저장소로 감싼 키
}

interface PendingDB extends DBSchema {
  items: { key: string; value: PendingRecord };
  keys: { key: string; value: KeyRecord };
}

// 데스크톱 앱 preload가 제공하는 운영체제 보안 저장소 통로(없으면 브라우저 방식 사용)
interface SecureBridge {
  protect: (plain: string) => Promise<string | null>;
  unprotect: (wrapped: string) => Promise<string | null>;
}
const secure = (window as unknown as { walksimDesktop?: { secure?: SecureBridge } }).walksimDesktop?.secure;

let dbPromise: Promise<IDBPDatabase<PendingDB>> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PendingDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('items', { keyPath: 'id' });
        db.createObjectStore('keys', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = loadOrCreateKey().catch(err => { keyPromise = null; throw err; });
  return keyPromise;
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  const db = await getDB();
  const existing = await db.get('keys', 'main');
  if (existing?.key) return existing.key;
  if (existing?.wrapped && secure) {
    const raw = await secure.unprotect(existing.wrapped);
    if (raw) return crypto.subtle.importKey('raw', fromB64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
    // 키를 풀 수 없으면(다른 사용자·다른 PC) 예전 보관분은 읽을 수 없으므로 비운다.
    await db.clear('items');
  }
  if (secure) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await secure.protect(toB64(raw));
    if (wrapped) {
      await db.put('keys', { id: 'main', wrapped });
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await db.put('keys', { id: 'main', key });
  return key;
}

async function encrypt(data: ArrayBuffer | Uint8Array): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, data: await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await getKey(), data as BufferSource) };
}

async function decrypt(iv: Uint8Array, data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await getKey(), data);
}

const encodeMeta = (meta: PendingMeta) => new TextEncoder().encode(JSON.stringify(meta));

export async function savePending(id: string, blob: Blob, meta: PendingMeta): Promise<void> {
  const [image, metaEnc] = await Promise.all([encrypt(await blob.arrayBuffer()), encrypt(encodeMeta(meta))]);
  const now = Date.now();
  const db = await getDB();
  await db.put('items', { id, createdAt: now, expiresAt: now + TTL_MS, imageIv: image.iv, image: image.data, metaIv: metaEnc.iv, meta: metaEnc.data });
}

export async function updatePendingMeta(id: string, meta: PendingMeta): Promise<void> {
  const db = await getDB();
  const record = await db.get('items', id);
  if (!record) return;
  const enc = await encrypt(encodeMeta(meta));
  await db.put('items', { ...record, metaIv: enc.iv, meta: enc.data });
}

export async function deletePending(id: string): Promise<void> {
  await (await getDB()).delete('items', id);
}

export async function clearPending(): Promise<void> {
  await (await getDB()).clear('items');
}

export interface RestoredPending { id: string; blob: Blob; meta: PendingMeta; expiresAt: number }

/** 보관된 캡처를 복호화해 돌려준다. 기간이 지났거나 풀 수 없는 것은 지운다. */
export async function loadPending(): Promise<RestoredPending[]> {
  const db = await getDB();
  const records = await db.getAll('items');
  const out: RestoredPending[] = [];
  for (const r of records) {
    if (r.expiresAt < Date.now()) { await db.delete('items', r.id); continue; }
    try {
      const meta = JSON.parse(new TextDecoder().decode(await decrypt(r.metaIv, r.meta))) as PendingMeta;
      const blob = new Blob([await decrypt(r.imageIv, r.image)], { type: meta.mime });
      out.push({ id: r.id, blob, meta, expiresAt: r.expiresAt });
    } catch {
      await db.delete('items', r.id);
    }
  }
  return out.sort((a, b) => a.meta.timestamp - b.meta.timestamp);
}
