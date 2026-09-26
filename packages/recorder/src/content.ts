import { formatKeyCombo } from '@walksim/shared/keys';
import type { PageSettledMessage, Rect, RecordedAction, TargetInfo, UserActionMessage, Viewport } from './messages';

// 녹화 중인 탭에 주입된다. 수집하는 것은 "어디를 클릭했는지(좌표·요소 종류)"와 민감정보 후보의 "좌표"뿐이다.
// 입력값·키 입력·텍스트 원문·URL·쿠키 등은 절대 읽어서 보내지 않는다(PRD §5 Recorder, §7.2).

declare global {
  interface Window { __walksimRecorder?: { stop: () => void } }
}

const QUIET_MS = 400;        // DOM 변화가 이만큼 없으면 "안정된 화면"으로 본다
const MAX_WAIT_MS = 2000;    // 계속 바뀌는 페이지라도 이 시간 뒤엔 캡처한다(PRD §6.2)
const DOUBLE_CLICK_MS = 400;  // 두 번째 클릭을 기다리는 시간(더블클릭 판별)
const DRAG_THRESHOLD_PX = 12;

const INTERACTIVE = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'summary', 'label',
  '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=option]',
  '[role=checkbox]', '[role=radio]', '[role=switch]', '[role=treeitem]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable=false])', '[draggable=true]',
].join(',');

const FIELD = 'input, textarea, [contenteditable]:not([contenteditable=false])';
const NON_TEXT_INPUT = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'hidden', 'image', 'file']);
const AVATAR = 'img[class*=avatar i], img[alt*=profile i], img[alt*=프로필], [class*=avatar i], [class*=profile-photo i]';

// 이메일, 휴대전화, 일반 전화, 주민등록번호, 카드번호 형태
const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g,
  /\b0\d{1,2}-\d{3,4}-\d{4}\b/g,
  /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
  /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g,
];
const looksSensitive = (text: string) => PII_PATTERNS.some(p => { p.lastIndex = 0; return p.test(text); }) || /\d{5,}/.test(text);

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}

function normalize(r: DOMRect, pad = 0): Rect | null {
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.max(0, r.left - pad), top = Math.max(0, r.top - pad);
  const right = Math.min(vw, r.right + pad), bottom = Math.min(vh, r.bottom + pad);
  if (right <= left || bottom <= top) return null; // 화면 밖
  return [left / vw, top / vh, (right - left) / vw, (bottom - top) / vh];
}

function isVisible(el: Element): boolean {
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

// 민감정보 후보 영역. 판단을 위해 값을 로컬에서 확인만 하고, 전송하는 것은 좌표뿐이다.
function detectSensitiveRects(): Rect[] {
  const rects: Rect[] = [];
  const push = (r: DOMRect) => { const n = normalize(r, 2); if (n && rects.length < 80) rects.push(n); };

  document.querySelectorAll<HTMLElement>(FIELD).forEach(el => {
    if (el instanceof HTMLInputElement) {
      if (NON_TEXT_INPUT.has(el.type)) return;
      if (el.type !== 'password' && !el.value) return; // 빈 칸(placeholder만 있는 칸)은 가릴 필요 없음
    } else if (el instanceof HTMLTextAreaElement) {
      if (!el.value) return;
    } else if (!el.textContent?.trim()) {
      return;
    }
    if (isVisible(el)) push(el.getBoundingClientRect());
  });

  document.querySelectorAll(AVATAR).forEach(el => { if (isVisible(el)) push(el.getBoundingClientRect()); });

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest('script,style,noscript,textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let visited = 0;
  for (let node = walker.nextNode(); node && visited < 4000; node = walker.nextNode(), visited++) {
    const text = node.nodeValue ?? '';
    if (text.length < 6) continue;
    for (const pattern of PII_PATTERNS) {
      pattern.lastIndex = 0;
      for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        for (const r of Array.from(range.getClientRects())) push(r);
      }
    }
  }
  return rects;
}

function describe(el: Element): TargetInfo {
  const info: TargetInfo = { tagName: el.tagName };
  const role = el.getAttribute('role');
  if (role) info.role = role.slice(0, 20);
  // 버튼·링크 이름만 지시문 초안에 쓴다. 입력칸의 값은 절대 읽지 않는다.
  const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
  const raw = el.getAttribute('aria-label')
    || (field ? (field.labels?.[0]?.innerText || field.placeholder) : (el as HTMLElement).innerText)
    || el.getAttribute('title')
    || '';
  const label = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (label && !looksSensitive(label)) info.label = label;
  return info;
}

function isTextField(el: Element): boolean {
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT.has(el.type);
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

// 녹화할 단축키: 수정 키(Ctrl/Cmd/Alt)와 함께 누른 키, 그리고 Enter·Esc·Delete·F1~F12.
// 일반 글자 입력은 절대 기록하지 않는다.
function shortcutOf(e: KeyboardEvent): string | null {
  if (e.isComposing || e.repeat) return null;
  const combo = formatKeyCombo(e);
  if (!combo) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return combo;
  if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement) return null; // 여러 줄 입력의 줄바꿈
  if (/^(Enter|Escape|Delete|F\d{1,2})$/.test(e.key)) return combo;
  return null;
}

function resolveTarget(e: Event): Element | null {
  const origin = e.composedPath()[0];
  if (!(origin instanceof Element)) return null;
  const interactive = origin.closest(INTERACTIVE);
  if (interactive) {
    const r = interactive.getBoundingClientRect();
    // 화면 대부분을 덮는 컨테이너는 핫스팟으로 부적절하므로 실제 클릭 요소를 쓴다.
    if (r.width * r.height < window.innerWidth * window.innerHeight * 0.5) return interactive;
  }
  return origin;
}

function start() {
  let seq = 0;
  let settledSeq = -1;
  let firstChangeAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const send = (msg: PageSettledMessage | UserActionMessage) => chrome.runtime.sendMessage(msg).catch(() => {});

  const settle = () => {
    firstChangeAt = 0;
    settledSeq = seq;
    send({ action: 'PAGE_SETTLED', seq, viewport: viewport(), suggestedMasks: detectSensitiveRects() });
  };

  const changed = () => {
    seq++;
    const now = performance.now();
    if (!firstChangeAt) firstChangeAt = now;
    clearTimeout(timer);
    timer = setTimeout(settle, Math.max(0, Math.min(QUIET_MS, MAX_WAIT_MS - (now - firstChangeAt))));
  };

  interface Snapshot { frameSeq: number | null; rect: Rect; target: TargetInfo; el: Element; masks: Rect[]; viewport: Viewport; at: number }
  let down: (Snapshot & { x: number; y: number; moved: boolean; dragging: boolean }) | null = null;
  let pendingClick: { snap: Snapshot; timer: ReturnType<typeof setTimeout> } | null = null;
  let pendingField: Snapshot | null = null; // 입력칸을 클릭함 → 글자를 치면 "입력" 단계, 아니면 "클릭"
  const typedFields = new WeakSet<Element>();

  // 동작 직전의 화면 상태(프레임 번호·좌표·민감정보 후보)를 기록해 둔다. 판단이 끝난 뒤 보내도 직전 화면을 쓸 수 있다.
  const snapshot = (el: Element): Snapshot | null => {
    const rect = normalize(el.getBoundingClientRect());
    if (!rect) return null;
    return { frameSeq: settledSeq === seq ? seq : null, rect, target: describe(el), el, masks: detectSensitiveRects(), viewport: viewport(), at: performance.now() };
  };

  const emit = (snap: Pick<Snapshot, 'frameSeq' | 'masks' | 'viewport'> & { rect: Rect | null; target: TargetInfo }, recorded: RecordedAction) => {
    send({ action: 'USER_ACTION', frameSeq: snap.frameSeq, rect: snap.rect, recorded, target: snap.target, viewport: snap.viewport, suggestedMasks: snap.masks });
  };

  const inputTypeOf = (el: Element) => (el instanceof HTMLInputElement ? el.type : el instanceof HTMLTextAreaElement ? 'textarea' : 'text');

  const flushPending = () => {
    if (pendingClick) { clearTimeout(pendingClick.timer); emit(pendingClick.snap, { kind: 'click' }); pendingClick = null; }
    if (pendingField) { emit(pendingField, { kind: 'click' }); pendingField = null; }
  };

  const dropRect = (x: number, y: number): Rect => {
    const el = document.elementFromPoint(x, y);
    const target = el?.closest(INTERACTIVE) ?? el;
    const r = target?.getBoundingClientRect();
    const small = r && r.width * r.height < window.innerWidth * window.innerHeight * 0.25 ? normalize(r) : null;
    return small ?? normalize(new DOMRect(x - 24, y - 24, 48, 48))!;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isTrusted || !e.isPrimary) return;
    const el = resolveTarget(e);
    if (!el) return;
    const sameAsPendingClick = pendingClick?.snap.el === el && performance.now() - pendingClick.snap.at < DOUBLE_CLICK_MS * 1.5;
    if (!sameAsPendingClick && pendingField?.el !== el) flushPending();
    if (e.button === 2) {
      const snap = snapshot(el);
      if (snap) emit(snap, { kind: 'right' });
      return;
    }
    if (e.button !== 0) return;
    const snap = snapshot(el);
    down = snap && { ...snap, x: e.clientX, y: e.clientY, moved: false, dragging: false };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD_PX) down.moved = true;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!down || down.dragging) return;
    const d = down;
    down = null;
    if (d.moved) { emit(d, { kind: 'drag', to: dropRect(e.clientX, e.clientY) }); return; }
    if (isTextField(d.el)) { pendingField = d; return; }
    if (pendingClick && pendingClick.snap.el === d.el) {
      clearTimeout(pendingClick.timer);
      emit(pendingClick.snap, { kind: 'double' });
      pendingClick = null;
      return;
    }
    const timer = setTimeout(() => { if (pendingClick) { emit(pendingClick.snap, { kind: 'click' }); pendingClick = null; } }, DOUBLE_CLICK_MS);
    pendingClick = { snap: d, timer };
  };

  // HTML5 드래그앤드롭은 pointerup 대신 drop/dragend가 온다.
  const onPointerCancel = () => { if (down) down.dragging = true; };
  const onDrop = (e: DragEvent) => {
    if (!down) return;
    const d = down;
    down = null;
    emit(d, { kind: 'drag', to: dropRect(e.clientX, e.clientY) });
  };
  const onDragEnd = () => { if (down?.dragging) down = null; };

  // 글자를 치기 시작하면 "입력" 단계로 기록한다. 입력한 내용은 읽지 않는다.
  const onInput = (e: Event) => {
    if (!e.isTrusted) return;
    const el = resolveTarget(e);
    if (!el || !isTextField(el) || typedFields.has(el)) return;
    typedFields.add(el);
    if (pendingField?.el === el) {
      emit(pendingField, { kind: 'type', inputType: inputTypeOf(el) });
      pendingField = null;
      return;
    }
    flushPending();
    const snap = snapshot(el); // Tab 키로 들어온 입력칸
    if (snap) emit(snap, { kind: 'type', inputType: inputTypeOf(el) });
  };
  const onFocusOut = (e: FocusEvent) => { if (e.target instanceof Element) typedFields.delete(e.target); };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;
    const keys = shortcutOf(e);
    if (!keys) return;
    flushPending();
    emit({ frameSeq: settledSeq === seq ? seq : null, rect: null, target: { tagName: 'KEY' }, masks: detectSensitiveRects(), viewport: viewport() }, { kind: 'key', keys });
  };

  const onVisibility = () => { if (document.visibilityState === 'visible') changed(); };
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const listeners: [EventTarget, string, EventListener][] = [
    [document, 'pointerdown', onPointerDown as EventListener],
    [document, 'pointermove', onPointerMove as EventListener],
    [document, 'pointerup', onPointerUp as EventListener],
    [document, 'pointercancel', onPointerCancel as EventListener],
    [document, 'drop', onDrop as EventListener],
    [document, 'dragend', onDragEnd as EventListener],
    [document, 'input', onInput as EventListener],
    [document, 'focusout', onFocusOut as EventListener],
    [document, 'keydown', onKeyDown as EventListener],
  ];
  for (const [t, type, fn] of listeners) t.addEventListener(type, fn, { capture: true });
  document.addEventListener('load', changed, { capture: true }); // 이미지 등 리소스 로드
  window.addEventListener('scroll', changed, { capture: true, passive: true });
  window.addEventListener('resize', changed);
  document.addEventListener('visibilitychange', onVisibility);
  changed(); // 녹화 시작 시점의 화면도 캡처

  const onMessage = (msg: { action?: string }) => { if (msg?.action === 'STOP_CONTENT') stop(); };
  chrome.runtime.onMessage.addListener(onMessage);

  function stop() {
    clearTimeout(timer);
    observer.disconnect();
    flushPending();
    for (const [t, type, fn] of listeners) t.removeEventListener(type, fn, { capture: true });
    document.removeEventListener('load', changed, { capture: true });
    window.removeEventListener('scroll', changed, { capture: true });
    window.removeEventListener('resize', changed);
    document.removeEventListener('visibilitychange', onVisibility);
    chrome.runtime.onMessage.removeListener(onMessage);
    delete window.__walksimRecorder;
  }

  window.__walksimRecorder = { stop };
}

// 같은 페이지에 다시 주입돼도 리스너가 중복 등록되지 않게 한다.
if (!window.__walksimRecorder) start();
