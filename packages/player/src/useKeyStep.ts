import { useEffect, useRef } from 'react';
import { keysMatch, type Step } from '@walksim/shared';

type Miss = (text: string) => void;

// 단축키: 창 전체의 키 입력을 듣는다. Ctrl과 Cmd(⌘)는 같은 키로 인정한다.
// 브라우저가 가로채는 조합(Ctrl+W, Ctrl+T, Ctrl+N 등)은 막을 수 없으므로 에디터에서 경고한다.
export function useKeyStep(step: Step, onSuccess: () => void, onMiss: Miss) {
  const handlers = useRef({ onSuccess, onMiss });
  useEffect(() => { handlers.current = { onSuccess, onMiss }; });
  useEffect(() => {
    if (step.type !== 'key') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || ['Control', 'Meta', 'Alt', 'Shift', 'CapsLock', 'Process'].includes(e.key) || e.isComposing) return;
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) return; // 키보드 초점 이동은 허용
      if (keysMatch(step.keys, e)) {
        e.preventDefault();
        handlers.current.onSuccess();
      } else {
        if (e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
        handlers.current.onMiss('다른 키를 눌렀어요. 다시 해 보세요.');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);
}
