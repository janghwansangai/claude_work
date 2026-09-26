import type { PageSettledMessage, Rect, TargetInfo, UserActionMessage, Viewport } from './messages';

// 녹화 중인 탭에 주입된다. 수집하는 것은 "어디를 클릭했는지(좌표·요소 종류)"와 민감정보 후보의 "좌표"뿐이다.
// 입력값·키 입력·텍스트 원문·URL·쿠키 등은 절대 읽어서 보내지 않는다(PRD §5 Recorder, §7.2).

declare global {
  interface Window { __walksimRecorder?: { stop: () => void } }
}

const QUIET_MS = 400;        // DOM 변화가 이만큼 없으면 "안정된 화면"으로 본다
const MAX_WAIT_MS = 2000;    // 계속 바뀌는 페이지라도 이 시간 뒤엔 캡처한다(PRD §6.2)
const MIN_ACTION_GAP_MS = 350;

const INTERACTIVE = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'summary', 'label',
  '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=option]',
  '[role=checkbox]', '[role=radio]', '[role=switch]', '[role=treeitem]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
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
  const raw = el.getAttribute('aria-label')
    || (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder : (el as HTMLElement).innerText)
    || el.getAttribute('title')
    || '';
  const label = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (label && !looksSensitive(label)) info.label = label;
  return info;
}

function resolveTarget(e: PointerEvent): Element | null {
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
  let lastActionAt = 0;

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

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isTrusted || !e.isPrimary || e.button !== 0) return;
    const now = performance.now();
    if (now - lastActionAt < MIN_ACTION_GAP_MS) return; // 더블클릭 등 중복 캡처 방지
    lastActionAt = now;
    const target = resolveTarget(e);
    const rect = target && normalize(target.getBoundingClientRect());
    if (!target || !rect) return;
    send({
      action: 'USER_ACTION',
      frameSeq: settledSeq === seq ? seq : null,
      rect,
      target: describe(target),
      viewport: viewport(),
      suggestedMasks: detectSensitiveRects(),
    });
  };

  const onVisibility = () => { if (document.visibilityState === 'visible') changed(); };
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
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
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
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
