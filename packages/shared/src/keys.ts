// 단축키 이름 처리. 의존성이 없어 레코더(콘텐츠 스크립트)에서도 가볍게 가져다 쓴다.

export interface KeyPress {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'Fn', 'OS']);
const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space', Esc: 'Escape', Del: 'Delete', Return: 'Enter',
  Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown',
};

function baseKeyName(press: KeyPress): string {
  // Shift·한글 입력 상태와 상관없이 같은 이름이 나오도록 물리 키(code)를 우선 사용한다.
  if (press.code?.startsWith('Key')) return press.code.slice(3);
  if (press.code?.startsWith('Digit')) return press.code.slice(5);
  const key = KEY_ALIASES[press.key] ?? press.key;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** 키 입력을 "Ctrl+Shift+S" 형태로 만든다. 수정 키만 눌렸으면 null. Cmd(⌘)는 Ctrl로 기록한다. */
export function formatKeyCombo(press: KeyPress): string | null {
  if (MODIFIER_KEYS.has(press.key)) return null;
  const parts: string[] = [];
  if (press.ctrlKey || press.metaKey) parts.push('Ctrl');
  if (press.altKey) parts.push('Alt');
  if (press.shiftKey) parts.push('Shift');
  parts.push(baseKeyName(press));
  return parts.join('+');
}

/** "ctrl + s", "Cmd+S", "⌘S" 등 사람이 적은 조합을 formatKeyCombo 형식으로 정리한다. */
export function normalizeKeyCombo(text: string): string {
  const raw = text.replace(/⌘/g, 'Cmd+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+');
  const parts = raw.split('+').map(p => p.trim()).filter(Boolean);
  const mods = new Set<string>();
  let key = '';
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (['ctrl', 'control', 'cmd', 'command', 'meta', 'win'].includes(lower)) mods.add('Ctrl');
    else if (['alt', 'option', 'opt'].includes(lower)) mods.add('Alt');
    else if (lower === 'shift') mods.add('Shift');
    else key = KEY_ALIASES[p] ?? (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1));
  }
  return [...['Ctrl', 'Alt', 'Shift'].filter(m => mods.has(m)), key].join('+');
}

export function keysMatch(expected: string[], press: KeyPress): boolean {
  const pressed = formatKeyCombo(press);
  return pressed !== null && expected.some(k => normalizeKeyCombo(k) === pressed);
}

/** 학생에게 보여 줄 키 이름. 맥에서는 Ctrl을 ⌘로 표시한다. */
export function displayKeyCombo(combo: string, isMac: boolean): string {
  return normalizeKeyCombo(combo).split('+').map(k => (isMac && k === 'Ctrl' ? '⌘' : k)).join(' + ');
}
