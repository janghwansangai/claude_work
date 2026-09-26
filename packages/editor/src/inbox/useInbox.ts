import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '@walksim/shared';
import { dataUrlToBlob } from '../imaging';
import { draftInstruction, newId, type CapturePayload, type CaptureTarget, type RecordedAction, type Viewport } from '../project';

// 검수함(review inbox): 마스킹 전 원본 캡처는 여기, 즉 탭 메모리에만 존재한다(PRD §5 P0, §7.2).
// IndexedDB·localStorage·네트워크 어디에도 쓰지 않으며 새로고침하면 사라진다.
export interface InboxItem {
  id: string;
  url: string; // 원본 이미지 blob: URL
  blob: Blob;
  rect: Rect | null;
  viewport: Viewport | null;
  target: CaptureTarget | null;
  action: RecordedAction | null;
  masks: Rect[];
  suggestedCount: number;
  instruction: string;
  timestamp: number;
}

export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const itemsRef = useRef(items);

  const commit = useCallback((next: InboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

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
      // 레코더가 찾은 민감정보 후보는 기본으로 가림 처리된 상태로 시작한다(교사가 해제 가능).
      masks: payload.suggestedMasks,
      suggestedCount: payload.suggestedMasks.length,
      instruction: draftInstruction(payload),
      timestamp: payload.timestamp,
    };
    commit([...itemsRef.current, item].sort((a, b) => a.timestamp - b.timestamp));
    return item;
  }, [commit]);

  const update = useCallback((id: string, patch: Partial<Pick<InboxItem, 'masks' | 'instruction' | 'rect' | 'action'>>) => {
    commit(itemsRef.current.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }, [commit]);

  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (item) URL.revokeObjectURL(item.url);
    commit(itemsRef.current.filter(i => i.id !== id));
  }, [commit]);

  // 원본은 메모리에만 있으므로, 검수 전에 페이지를 떠나면 사라진다는 것을 알린다.
  useEffect(() => {
    if (items.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [items.length]);

  useEffect(() => () => { itemsRef.current.forEach(i => URL.revokeObjectURL(i.url)); }, []);

  return { items, add, update, remove };
}
