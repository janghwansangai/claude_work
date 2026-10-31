import { useCallback, useRef, useState } from 'react';

// 되돌리기(Ctrl/⌘+Z)·다시 실행(Ctrl/⌘+Shift+Z, Ctrl+Y) 기록.
// 바꾸기 직전에 checkpoint()로 지금 상태를 찍어 두고, 되돌리면 그 상태로 돌아간다.
// 글자 입력처럼 잦은 변경은 같은 key로 묶어(COALESCE_MS 안) 한 번에 되돌린다.

const LIMIT = 100;
const COALESCE_MS = 1500;

export interface Stamped<T> { state: T; at: number; label: string }

export function useUndoHistory<T>(capture: () => T, apply: (state: T, at: number) => void) {
  const past = useRef<Stamped<T>[]>([]);
  const future = useRef<Stamped<T>[]>([]);
  const last = useRef<{ key: string; time: number } | null>(null);
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  const checkpoint = useCallback((label: string, key?: string) => {
    const now = Date.now();
    if (key && last.current?.key === key && now - last.current.time < COALESCE_MS) {
      last.current.time = now;
      return;
    }
    past.current.push({ state: capture(), at: now, label });
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    last.current = key ? { key, time: now } : null;
    bump();
  }, [capture]);

  const undo = useCallback((): string | null => {
    const entry = past.current.pop();
    if (!entry) return null;
    future.current.push({ state: capture(), at: Date.now(), label: entry.label });
    last.current = null;
    apply(entry.state, entry.at);
    bump();
    return entry.label;
  }, [apply, capture]);

  const redo = useCallback((): string | null => {
    const entry = future.current.pop();
    if (!entry) return null;
    past.current.push({ state: capture(), at: Date.now(), label: entry.label });
    last.current = null;
    apply(entry.state, entry.at);
    bump();
    return entry.label;
  }, [apply, capture]);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    last.current = null;
    bump();
  }, []);

  return {
    checkpoint, undo, redo, clear,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

/** 글자 입력 중(입력칸·textarea·select)이면 단축키를 가로채지 않는다. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
  }
  return false;
}
