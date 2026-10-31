import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation, Rect } from '@walksim/shared';
import { dataUrlToBlob } from '../imaging';
import { draftInstruction, newId, type CapturePayload, type CaptureTarget, type RecordedAction, type Viewport } from '../project';
import { clearPending, deletePending, loadPending, savePending, updatePendingMeta, type PendingMeta } from '../storage/pendingStore';

// 검수함(review inbox): 마스킹 전 원본 캡처.
// 나중에 검수할 수 있도록 암호화해서 보관하고(pendingStore), 승인·버리기 즉시 지운다.
// 가림이 적용된 승인본만 프로젝트 저장소(IndexedDB walksim-editor)에 들어간다.
// 되돌리기(Ctrl/⌘+Z)를 위해 버린 캡처의 이미지는 이 창이 열려 있는 동안 메모리에만 남겨 둔다(디스크에서는 즉시 삭제).
export interface InboxItem {
  id: string;
  url: string; // 원본 이미지 blob: URL
  blob: Blob;
  rect: Rect | null;
  viewport: Viewport | null;
  target: CaptureTarget | null;
  action: RecordedAction | null;
  source: 'browser' | 'desktop';
  masks: Rect[];
  suggestedCount: number;
  instruction: string;
  timestamp: number;
  targets: Rect[];           // 같은 화면에서 순서대로 누를 추가 버튼(rect가 1번)
  annotations: Annotation[]; // 교사가 그린 강조 표시
  pageUrl?: string;          // 실제 사이트 주소(분할 화면 링크)
  seq: number;               // 검수함 순서
  arrivedAt: number;         // 이 창에 들어온 시각(되돌리기 때 새로 녹화된 캡처를 지키는 데 쓴다)
}

export type InboxPatch = Partial<Pick<InboxItem, 'masks' | 'instruction' | 'rect' | 'action' | 'targets' | 'annotations' | 'pageUrl'>>;
export type InboxStorage = 'loading' | 'saved' | 'memory-only';

export const metaOf = (item: InboxItem): PendingMeta => ({
  rect: item.rect, viewport: item.viewport, target: item.target, action: item.action, source: item.source,
  masks: item.masks, suggestedCount: item.suggestedCount, instruction: item.instruction, timestamp: item.timestamp,
  mime: item.blob.type, targets: item.targets, annotations: item.annotations, url: item.pageUrl, seq: item.seq,
});

function fromStored(id: string, blob: Blob, meta: PendingMeta): InboxItem {
  return {
    id, url: URL.createObjectURL(blob), blob,
    rect: meta.rect, viewport: meta.viewport, target: meta.target, action: meta.action, source: meta.source,
    masks: meta.masks, suggestedCount: meta.suggestedCount, instruction: meta.instruction, timestamp: meta.timestamp,
    targets: meta.targets ?? [], annotations: meta.annotations ?? [], pageUrl: meta.url,
    seq: meta.seq ?? meta.timestamp, arrivedAt: 0,
  };
}

const bySeq = (a: InboxItem, b: InboxItem) => a.seq - b.seq;
const META_SAVE_DEBOUNCE_MS = 500;

export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [storage, setStorage] = useState<InboxStorage>('loading');
  const itemsRef = useRef(items);
  const metaTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const urls = useRef(new Set<string>());

  const commit = useCallback((next: InboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const persistFailed = useCallback((err: unknown) => {
    console.error('검수 전 캡처 임시 보관 실패:', err);
    setStorage('memory-only');
  }, []);

  const track = useCallback((item: InboxItem) => { urls.current.add(item.url); return item; }, []);

  const saveMeta = useCallback((id: string, delay = META_SAVE_DEBOUNCE_MS) => {
    clearTimeout(metaTimers.current.get(id));
    metaTimers.current.set(id, setTimeout(() => {
      metaTimers.current.delete(id);
      const item = itemsRef.current.find(i => i.id === id);
      if (item) updatePendingMeta(id, metaOf(item)).catch(persistFailed);
    }, delay));
  }, [persistFailed]);

  // 지난번에 검수하지 못한 캡처를 되살린다.
  useEffect(() => {
    let cancelled = false;
    loadPending()
      .then(restored => {
        if (cancelled) return;
        const fromStore = restored.map(r => track(fromStored(r.id, r.blob, r.meta)));
        const known = new Set(itemsRef.current.map(i => i.id));
        commit([...itemsRef.current, ...fromStore.filter(i => !known.has(i.id))].sort(bySeq));
        setStorage('saved');
      })
      .catch(err => { if (!cancelled) persistFailed(err); });
    return () => { cancelled = true; };
  }, [commit, persistFailed, track]);

  const add = useCallback((payload: CapturePayload): InboxItem => {
    const blob = dataUrlToBlob(payload.image);
    const lastSeq = itemsRef.current.reduce((m, i) => Math.max(m, i.seq), 0);
    const item: InboxItem = track({
      id: newId('capture'),
      url: URL.createObjectURL(blob),
      blob,
      rect: payload.rect,
      viewport: payload.viewport,
      target: payload.target,
      action: payload.action,
      source: payload.source,
      // 레코더가 찾은 민감정보 후보는 기본으로 가림 처리된 상태로 시작한다(교사가 해제 가능).
      masks: payload.suggestedMasks,
      suggestedCount: payload.suggestedMasks.length,
      instruction: draftInstruction(payload),
      timestamp: payload.timestamp,
      targets: [],
      annotations: [],
      pageUrl: payload.pageUrl,
      seq: Math.max(payload.timestamp, lastSeq + 1),
      arrivedAt: Date.now(),
    });
    commit([...itemsRef.current, item].sort(bySeq));
    savePending(item.id, blob, metaOf(item)).catch(persistFailed);
    return item;
  }, [commit, persistFailed, track]);

  const update = useCallback((id: string, patch: InboxPatch) => {
    commit(itemsRef.current.map(item => (item.id === id ? { ...item, ...patch } : item)));
    saveMeta(id);
  }, [commit, saveMeta]);

  const removeMany = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    for (const id of ids) {
      clearTimeout(metaTimers.current.get(id));
      metaTimers.current.delete(id);
      deletePending(id).catch(persistFailed);
    }
    commit(itemsRef.current.filter(i => !gone.has(i.id)));
  }, [commit, persistFailed]);

  const remove = useCallback((id: string) => removeMany([id]), [removeMany]);

  /** 장면을 복사해 바로 뒤에 넣는다(같은 화면으로 두 단계를 만들 때). */
  const duplicate = useCallback((id: string): InboxItem | null => {
    const list = itemsRef.current;
    const index = list.findIndex(i => i.id === id);
    const original = list[index];
    if (!original) return null;
    const after = list[index + 1];
    const copy: InboxItem = track({
      ...structuredClone({ ...original, blob: undefined, url: undefined }),
      id: newId('capture'),
      blob: original.blob,
      url: URL.createObjectURL(original.blob),
      annotations: original.annotations.map(a => ({ ...a, id: newId('a') })),
      seq: after ? (original.seq + after.seq) / 2 : original.seq + 1,
      arrivedAt: 0,
    } as InboxItem);
    commit([...list, copy].sort(bySeq));
    savePending(copy.id, copy.blob, metaOf(copy)).catch(persistFailed);
    return copy;
  }, [commit, persistFailed, track]);

  /** 장면 순서를 한 칸 위(-1)나 아래(+1)로 옮긴다. */
  const move = useCallback((id: string, dir: -1 | 1) => {
    const list = [...itemsRef.current];
    const i = list.findIndex(x => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = { ...list[i], seq: list[j].seq };
    const b = { ...list[j], seq: list[i].seq };
    list[i] = b;
    list[j] = a;
    commit(list.sort(bySeq));
    saveMeta(a.id, 0);
    saveMeta(b.id, 0);
  }, [commit, saveMeta]);

  /**
   * 되돌리기: 검수함을 예전 상태로 되돌리고 암호화 보관함도 맞춘다.
   * since 이후에 새로 녹화되어 들어온 캡처는 되돌리기와 상관없으므로 그대로 둔다.
   */
  const restore = useCallback((snapshot: InboxItem[], since: number) => {
    const current = itemsRef.current;
    const wanted = new Map(snapshot.map(i => [i.id, i]));
    const kept = current.filter(i => !wanted.has(i.id) && i.arrivedAt > since);
    const next = [...snapshot, ...kept].sort(bySeq);
    const before = new Map(current.map(i => [i.id, i]));
    for (const item of current) {
      if (!wanted.has(item.id) && !kept.includes(item)) deletePending(item.id).catch(persistFailed);
    }
    for (const item of snapshot) {
      const was = before.get(item.id);
      if (!was) savePending(item.id, item.blob, metaOf(item)).catch(persistFailed);
      else if (was !== item) updatePendingMeta(item.id, metaOf(item)).catch(persistFailed);
    }
    commit(next);
  }, [commit, persistFailed]);

  /** 프로젝트 파일에서 불러온 검수 전 캡처를 검수함에 넣는다. */
  const addRestored = useCallback((restored: { blob: Blob; meta: PendingMeta }[]) => {
    const added = restored.map(r => track(fromStored(newId('capture'), r.blob, r.meta)));
    commit([...itemsRef.current, ...added].sort(bySeq));
    for (const item of added) savePending(item.id, item.blob, metaOf(item)).catch(persistFailed);
  }, [commit, persistFailed, track]);

  const removeAll = useCallback(() => {
    itemsRef.current.forEach(i => clearTimeout(metaTimers.current.get(i.id)));
    metaTimers.current.clear();
    commit([]);
    clearPending().catch(persistFailed);
  }, [commit, persistFailed]);

  // 임시 보관이 안 되는 환경(저장소 오류)에서만 떠날 때 경고한다.
  useEffect(() => {
    if (items.length === 0 || storage !== 'memory-only') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [items.length, storage]);

  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const snapshot = useCallback(() => itemsRef.current, []);

  return { items, storage, add, addRestored, update, remove, removeMany, duplicate, move, restore, removeAll, snapshot };
}
