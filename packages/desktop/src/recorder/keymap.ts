// uiohook 키 코드를 분류 정보로 바꾼다. 결과에는 "글자 키였는지"와 단축키 이름만 남고,
// 어떤 글자를 쳤는지는 남기지 않는다(단축키가 아닌 글자 키는 printable=true 한 비트로만 전달).
import { formatKeyCombo } from '@walksim/shared/keys';

export interface RawKey { keycode: number; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }
export interface KeyInfo { printable: boolean; combo: string | null; ends: boolean }

// 녹화 제어용 전역 단축키(일시정지·중지)는 녹화하지 않는다.
export const PAUSE_HOTKEY = 'Ctrl+Shift+F8';
export const STOP_HOTKEY = 'Ctrl+Shift+F9';

const PUNCTUATION: Record<string, string> = {
  Semicolon: ';', Equal: '=', Comma: ',', Minus: '-', Period: '.', Slash: '/', Backquote: '`',
  BracketLeft: '[', Backslash: '\\', BracketRight: ']', Quote: "'",
};
const MODIFIERS = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight', 'CapsLock', 'NumLock', 'ScrollLock']);
const SPECIAL_SHORTCUT = /^(Enter|Escape|Delete|F\d{1,2})$/;
const ENDS_TYPING = new Set(['Enter', 'Tab', 'Escape']);

export function createKeyMapper(codes: Record<string, number>) {
  const names = new Map<number, string>();
  for (const [name, code] of Object.entries(codes)) if (typeof code === 'number' && !names.has(code)) names.set(code, name);

  return (e: RawKey): KeyInfo => {
    let name = names.get(e.keycode);
    if (!name || MODIFIERS.has(name)) return { printable: false, combo: null, ends: false };
    if (name === 'NumpadEnter') name = 'Enter';
    const withMod = e.ctrlKey || e.metaKey || e.altKey;
    const keyName = PUNCTUATION[name] ?? (name.startsWith('Numpad') && /\d$/.test(name) ? name.slice(-1) : name);
    const printable = !withMod && (keyName.length === 1 || name === 'Space' || /^Numpad(Multiply|Add|Subtract|Decimal|Divide)$/.test(name));
    let combo: string | null = null;
    if (withMod || SPECIAL_SHORTCUT.test(keyName)) {
      combo = formatKeyCombo({ key: keyName, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey });
      if (combo === PAUSE_HOTKEY || combo === STOP_HOTKEY) combo = null;
    }
    return { printable, combo, ends: ENDS_TYPING.has(keyName) };
  };
}
