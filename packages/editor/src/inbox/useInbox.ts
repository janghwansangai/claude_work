import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '@walksim/shared';
import { dataUrlToBlob } from '../imaging';
import { draftInstruction, newId, type CapturePayload, type CaptureTarget, type RecordedAction, type Viewport } from '../project';
import { clearPending, deletePending, loadPending, savePending, updatePendingMeta, type PendingMeta } from '../storage/pendingStore';

// 검수함(review inbox): 마스킹 전 원본 캡처.
// 나중에 검수할 수 있도록 암호화해서 임시 보관하고(pendingStore), 승인·버리기 즉시 지운다. 7일 뒤 자동 삭제.
// 가림이 적용된 승인본만 프로젝트 저장소(IndexedDB walksim-editor)에 들어간다.
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
  expiresAt: number;
}

export type InboxStorage = 'loading' | 'saved' | 'memory-only';

const metaOf = (item: InboxItem): PendingMeta => ({
  rect: item.rect, viewport: item.viewport, target: item.target, action: item.action, source: item.source,
  masks: item.masks, suggestedCount: item.suggestedCount, instruction: item.instruction, timestamp: item.timestamp,
  mime: item.blob.type,
});

const META_SAVE_DEBOUNCE_MS = 500;

export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [storage, setStorage] = useState<InboxStorage>('loading');
  const itemsRef = useRef(items);
  const metaTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const commit = useCallback((next: InboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const persistFailed = useCallback((err: unknown) => {
    console.error('검수 전 캡처 임시 보관 실패:', err);
    setStorage('memory-only');
  }, []);

  // 지난번에 검수하지 못한 캡처를 되살린다.
  useEffect(() => {
    let cancelled = false;
    loadPending()
      .then(restored => {
        if (cancelled) return;
        const fromStore: InboxItem[] = restored.map(r => ({ id: r.id, url: URL.createObjectURL(r.blob), blob: r.blob, expiresAt: r.expiresAt, ...r.meta }));
        const known = new Set(itemsRef.current.map(i => i.id));
        commit([...itemsRef.current, ...fromStore.filter(i => !known.has(i.id))].sort((a, b) => a.timestamp - b.timestamp));
        setStorage('saved');
      })
      .catch(err => { if (!cancelled) persistFailed(err); });
    return () => { cancelled = true; };
  }, [commit, persistFailed]);

  const add = useCallback((payload: CapturePayload): InboxItem => {
    const blob = dataUrlToBlob(payload.image);
    const item: InboxItem = {
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
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    commit([...itemsRef.current, item].sort((a, b) => a.timestamp - b.timestamp));
    savePending(item.id, blob, metaOf(item)).catch(persistFailed);
    return item;
  }, [commit, persistFailed]);

  const update = useCallback((id: string, patch: Partial<Pick<InboxItem, 'masks' | 'instruction' | 'rect' | 'action'>>) => {
    commit(itemsRef.current.map(item => (item.id === id ? { ...item, ...patch } : item)));
    clearTimeout(metaTimers.current.get(id));
    metaTimers.current.set(id, setTimeout(() => {
      metaTimers.current.delete(id);
      const item = itemsRef.current.find(i => i.id === id);
      if (item) updatePendingMeta(id, metaOf(item)).catch(persistFailed);
    }, META_SAVE_DEBOUNCE_MS));
  }, [commit, persistFailed]);

  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.url);
    clearTimeout(metaTimers.current.get(id));
    metaTimers.current.delete(id);
    commit(itemsRef.current.filter(i => i.id !== id));
    deletePending(id).catch(persistFailed);
  }, [commit, persistFailed]);

  const removeAll = useCallback(() => {
    itemsRef.current.forEach(i => { URL.revokeObjectURL(i.url); clearTimeout(metaTimers.current.get(i.id)); });
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

  useEffect(() => () => { itemsRef.current.forEach(i => URL.revokeObjectURL(i.url)); }, []);

  return { items, storage, add, update, remove, removeAll };
}
