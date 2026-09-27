// WalkSim 데스크톱: 윈도우·맥의 모든 프로그램(윈도우 자체, 브라우저 화면, 유니티 등)을 녹화하는 앱.
// 교사용 에디터(웹과 동일)를 앱 안에서 열고, 전역 입력 훅 + 화면 스트림으로 "동작 직전 화면"과 동작 종류를 기록한다.
// 개인정보: 원본 화면은 메모리에서만 다루고 에디터 검수함으로만 전달한다. 디스크·네트워크로 보내지 않는다.
import {
  app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, net, protocol, screen, session, shell, systemPreferences,
  type Display,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ActionClassifier, type DesktopAction, type InputEvent, type Point } from './recorder/actions';
import { inRect, normalizeInRegion, pickElementRect, type RectDip } from './recorder/geometry';
import { createKeyMapper } from './recorder/keymap';
import { safeLabel } from './recorder/privacy';
import { UiAutomation, type ElementInfo } from './recorder/uia';

const APP_DIR = path.join(__dirname, 'app');
const UI_DIR = path.join(__dirname, 'ui');
const EDITOR_URL = 'walksim://app/editor/index.html';

// 테스트·여러 교사 프로필용: 데이터 폴더를 따로 지정할 수 있다.
if (process.env.WALKSIM_USER_DATA) app.setPath('userData', process.env.WALKSIM_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: 'walksim', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let editorWin: BrowserWindow | null = null;
let editorReady = false;
const queue: unknown[] = [];

interface Recording {
  display: Display;
  region: RectDip;
  classifier: ActionClassifier;
  paused: boolean;
  count: number;
  capture: BrowserWindow;
  toolbar: BrowserWindow;
  frames: Map<number, Promise<string | null>>;   // 이벤트 번호 → 고정해 둔 직전 화면(JPEG data URL)
  elements: Map<number, Promise<ElementInfo | null>>;
  chain: Promise<void>;
  nextId: number;
}
let rec: Recording | null = null;
// 화면 스트림(getUserMedia) 권한을 줄 창. 캡처 창 하나뿐이다.
const mediaAllowed = new Set<number>();

const uia = new UiAutomation();

// ---------- 앱 파일 제공 (walksim://app/...) ----------
function serveApp() {
  protocol.handle('walksim', req => {
    const url = new URL(req.url);
    const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = path.join(APP_DIR, rel);
    if (url.host !== 'app' || !file.startsWith(APP_DIR + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// 에디터·보조 창이 외부 사이트로 이동하거나 새 창을 여는 것을 막는다.
function lockDown(win: BrowserWindow, allowedPrefix: string) {
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(allowedPrefix)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url); // 도움말 링크 등은 기본 브라우저로
    return { action: 'deny' };
  });
}

function createEditor() {
  editorWin = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'WalkSim',
    webPreferences: { preload: path.join(__dirname, 'preload-editor.js'), contextIsolation: true, sandbox: true },
  });
  lockDown(editorWin, 'walksim://app/');
  editorWin.on('closed', () => { editorWin = null; editorReady = false; });
  void editorWin.loadURL(EDITOR_URL);
}

function sendToEditor(channel: string, payload: unknown) {
  editorWin?.webContents.send(channel, payload);
}

function deliver(payload: unknown) {
  if (editorWin && editorReady) sendToEditor('rec:capture', payload);
  else queue.push(payload);
}

function broadcastState() {
  const state = rec ? { recording: true, paused: rec.paused, count: rec.count } : { recording: false, paused: false, count: 0 };
  sendToEditor('rec:state', state);
  rec?.toolbar.webContents.send('toolbar:state', state);
}

// ---------- 권한 (macOS) ----------
const BUNDLE_ID = 'app.walksim.desktop'; // package.json build.appId 와 같아야 한다
const TCC_SERVICES = ['ScreenCapture', 'Accessibility', 'ListenEvent'];

// 서명 없는(애드혹) 앱은 새 버전을 설치할 때마다 서명값이 바뀌어, 설정에는 켜져 있어도 예전 버전에 준 권한으로 남는다.
// 이때는 WalkSim의 권한 기록을 지우고 다시 허용받아야 한다.
async function resetPermissionsAndRelaunch() {
  const { execFile } = await import('node:child_process');
  await Promise.all(TCC_SERVICES.map(service => new Promise<void>(resolve => {
    execFile('/usr/bin/tccutil', ['reset', service, BUNDLE_ID], () => resolve());
  })));
  await dialog.showMessageBox({
    type: 'info',
    message: 'WalkSim의 예전 권한 기록을 지웠습니다',
    detail: '앱이 다시 시작됩니다. 다시 ‘화면 녹화 시작’을 누르고, macOS가 묻는 화면 기록·손쉬운 사용 권한을 허용하세요.\n권한을 허용한 뒤 macOS가 “종료 후 다시 열기”를 요구하면 WalkSim을 한 번 더 다시 실행하면 됩니다.',
  });
  app.relaunch();
  app.exit(0);
}

// macOS는 앱이 실제로 화면을 찍으려고 시도해야 권한 목록에 앱을 올리고 허용 요청을 띄운다.
// (1x1 같은 빈 요청은 실제 캡처가 일어나지 않아 목록에 나타나지 않을 수 있다)
async function probeScreenCapture() {
  await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 200 } }).catch(() => []);
}

// DMG 창에서 바로 실행하면 macOS가 매번 임시 위치(App Translocation)에서 실행해 권한이 유지되지 않는다.
async function offerMoveToApplications() {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['응용 프로그램 폴더로 옮기기 (권장)', '나중에'],
    defaultId: 0,
    cancelId: 1,
    message: 'WalkSim을 응용 프로그램 폴더로 옮길까요?',
    detail: '다운로드 폴더나 설치 디스크(DMG) 창에서 바로 실행하면 macOS가 화면 기록 권한을 기억하지 못합니다. 옮긴 뒤 자동으로 다시 시작합니다.',
  });
  if (response !== 0) return;
  try {
    app.moveToApplicationsFolder();
  } catch (err) {
    await dialog.showMessageBox({ type: 'warning', message: '옮기지 못했습니다', detail: `Finder에서 WalkSim을 응용 프로그램 폴더로 끌어다 놓은 뒤 그곳에서 실행하세요.\n(${(err as Error).message})` });
  }
}

type PermissionChoice = 'reset' | 'settings' | 'continue' | 'cancel';

async function askAboutPermission(kind: 'screen' | 'input'): Promise<PermissionChoice> {
  const screenText = '시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음';
  const inputText = '시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용(및 입력 모니터링)';
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['권한 다시 설정 (권장)', '설정 열기', '그래도 녹화 시도', '취소'],
    defaultId: 0,
    cancelId: 3,
    message: kind === 'screen' ? '화면 기록 권한이 확인되지 않습니다' : '손쉬운 사용 권한이 확인되지 않습니다',
    detail: [
      `${kind === 'screen' ? screenText : inputText}에서 WalkSim을 켜야 합니다.`,
      ...(kind === 'input' ? ['클릭·키 입력의 “종류”만 기록하며, 입력한 글자 내용은 기록하지 않습니다.'] : []),
      '',
      '이미 켜져 있는데도 이 메시지가 보이면, 새 버전을 설치하면서 macOS가 예전 권한을 새 앱에 적용하지 않은 것입니다.',
      '‘권한 다시 설정’을 누르면 WalkSim의 예전 권한 기록을 지우고 앱을 다시 시작합니다.',
      '',
      '설정 목록에 WalkSim이 보이지 않으면: 목록 아래 「+」를 눌러 응용 프로그램 폴더의 WalkSim을 추가하고 켠 뒤, WalkSim을 다시 실행하세요.',
    ].join('\n'),
  });
  return (['reset', 'settings', 'continue', 'cancel'] as const)[response] ?? 'cancel';
}

async function ensurePermissions(): Promise<string | null> {
  if (process.platform !== 'darwin') return null;

  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    await probeScreenCapture(); // 권한 요청 창·설정 목록 등록
    const choice = await askAboutPermission('screen');
    if (choice === 'reset') { await resetPermissionsAndRelaunch(); return '앱을 다시 시작합니다.'; }
    if (choice === 'settings') {
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      return '화면 기록 권한을 켠 뒤 WalkSim을 다시 실행하세요.';
    }
    if (choice === 'cancel') return '녹화를 취소했습니다.';
    // 'continue': 상태 확인이 틀린 경우를 대비해 그대로 진행한다(권한이 정말 없으면 배경화면만 찍힌다).
  }

  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true); // macOS 안내 창 표시(손쉬운 사용 목록에도 등록된다)
    const choice = await askAboutPermission('input');
    if (choice === 'reset') { await resetPermissionsAndRelaunch(); return '앱을 다시 시작합니다.'; }
    if (choice === 'settings') {
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return '손쉬운 사용 권한을 켠 뒤 WalkSim을 다시 실행하세요.';
    }
    if (choice === 'cancel') return '녹화를 취소했습니다.';
  }
  return null;
}

// ---------- 녹화 영역 선택 ----------
// 모니터마다 선택 화면을 띄우고, 교사가 드래그한(또는 '전체 화면'을 누른) 모니터를 녹화한다.
function selectRegion(): Promise<{ display: Display; region: RectDip } | null> {
  return new Promise(resolve => {
    const displays = screen.getAllDisplays();
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const overlays = displays.map((display, i) => {
      const b = display.bounds;
      const win = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height,
        frame: false, transparent: true, alwaysOnTop: true, resizable: false, movable: false, skipTaskbar: true, hasShadow: false,
        webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true },
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setBounds(b); // 일부 환경에서 창이 다른 모니터로 밀리는 것을 막는다
      lockDown(win, pathToFileURL(UI_DIR).toString());
      void win.loadFile(path.join(UI_DIR, 'overlay.html'), {
        query: { monitor: String(i + 1), total: String(displays.length), current: display.id === cursorDisplay.id ? '1' : '0' },
      });
      return { display, win };
    });

    let done = false;
    const finish = (result: { display: Display; region: RectDip } | null) => {
      if (done) return;
      done = true;
      ipcMain.removeHandler('overlay:done');
      for (const o of overlays) if (!o.win.isDestroyed()) o.win.close();
      resolve(result);
    };
    ipcMain.handle('overlay:done', (e, r: RectDip | null) => {
      const o = overlays.find(x => x.win.webContents === e.sender);
      if (!o) return;
      const b = o.display.bounds;
      finish(r && r.width >= 40 && r.height >= 40
        ? { display: o.display, region: { x: b.x + r.x, y: b.y + r.y, width: r.width, height: r.height } }
        : null);
    });
    for (const o of overlays) o.win.on('closed', () => finish(null));
  });
}

// ---------- 화면 스트림(캡처 창) ----------
// 모니터별 화면 소스를 고른다. 소스가 모니터 구분 없이 하나(가상 데스크톱 전체)뿐인 환경이면 전체 영역 기준으로 잘라 낸다.
async function sourceFor(display: Display): Promise<{ id: string; bounds: RectDip; scale: number }> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  if (sources.length === 0) throw new Error('캡처할 화면을 찾지 못했습니다.');
  const matched = sources.find(s => s.display_id === String(display.id));
  if (matched) return { id: matched.id, bounds: display.bounds, scale: display.scaleFactor };
  const displays = screen.getAllDisplays();
  if (sources.length === displays.length) {
    const i = displays.findIndex(d => d.id === display.id);
    return { id: sources[Math.max(0, i)].id, bounds: display.bounds, scale: display.scaleFactor };
  }
  const x = Math.min(...displays.map(d => d.bounds.x));
  const y = Math.min(...displays.map(d => d.bounds.y));
  const right = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
  return { id: sources[0].id, bounds: { x, y, width: right - x, height: bottom - y }, scale: display.scaleFactor };
}

async function startCapture(display: Display, region: RectDip): Promise<BrowserWindow> {
  const source = await sourceFor(display);
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  lockDown(win, pathToFileURL(UI_DIR).toString());
  mediaAllowed.add(win.webContents.id);
  win.on('closed', () => mediaAllowed.clear());
  await win.loadFile(path.join(UI_DIR, 'capture.html'));
  const res = await invokeRenderer<{ ok: boolean; error?: string }>(win, 'cap:start', {
    sourceId: source.id,
    display: source.bounds,
    scale: source.scale,
    region,
  });
  if (!res.ok) throw new Error(res.error ?? '화면 스트림을 시작하지 못했습니다.');
  return win;
}

// 렌더러에 요청을 보내고 응답을 기다린다(ipcRenderer.invoke의 반대 방향). 응답은 하나의 리스너가 번호로 나눠 준다.
let reqSeq = 0;
const replies = new Map<number, { wc: Electron.WebContents; resolve: (v: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
ipcMain.on('ui:reply', (e, id: number, value: unknown) => {
  const pending = replies.get(id);
  if (!pending || pending.wc !== e.sender) return;
  clearTimeout(pending.timer);
  replies.delete(id);
  pending.resolve(value);
});

function invokeRenderer<T>(win: BrowserWindow, channel: string, args: unknown, timeoutMs = 8000): Promise<T> {
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { replies.delete(reqId); reject(new Error(`${channel} 응답 없음`)); }, timeoutMs);
    replies.set(reqId, { wc: win.webContents, resolve: v => resolve(v as T), timer });
    win.webContents.send(channel, reqId, args);
  });
}

// ---------- 녹화 도구 막대 ----------
function createToolbar(display: Display, region: RectDip): BrowserWindow {
  const w = 520, h = 52;
  const wa = display.workArea;
  const above = region.y - wa.y >= h + 8;
  const x = Math.round(Math.min(Math.max(wa.x + 8, region.x + region.width / 2 - w / 2), wa.x + wa.width - w - 8));
  const y = above ? region.y - h - 6 : wa.y + wa.height - h - 8;
  const bar = new BrowserWindow({
    x, y, width: w, height: h, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    transparent: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true },
  });
  bar.setAlwaysOnTop(true, 'screen-saver');
  bar.setContentProtection(true); // 녹화 화면에 도구 막대가 찍히지 않게 한다(Windows 10 2004+/macOS)
  lockDown(bar, pathToFileURL(UI_DIR).toString());
  void bar.loadFile(path.join(UI_DIR, 'toolbar.html'));
  return bar;
}

// ---------- 입력 훅 ----------
const toDip = (x: number, y: number): Point => (process.platform === 'win32' ? screen.screenToDipPoint({ x, y }) : { x, y });

function elementToDip(el: ElementInfo): RectDip {
  if (process.platform !== 'win32') return el;
  return screen.screenToDipRect(null, { x: Math.round(el.x), y: Math.round(el.y), width: Math.round(el.width), height: Math.round(el.height) });
}

// uiohook-napi는 네이티브 모듈이라 녹화할 때만 불러온다.
type Hook = typeof import('uiohook-napi');
let hook: Hook | null = null;
let keyMapper: ReturnType<typeof createKeyMapper> | null = null;

function loadHook(): Hook {
  if (!hook) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hook = require('uiohook-napi') as Hook;
    keyMapper = createKeyMapper(hook.UiohookKey as unknown as Record<string, number>);
    const { uIOhook, WheelDirection } = hook;
    uIOhook.on('mousedown', e => onRaw({ type: 'down', x: e.x, y: e.y, button: Number(e.button) }));
    uIOhook.on('mouseup', e => onRaw({ type: 'up', x: e.x, y: e.y, button: Number(e.button) }));
    uIOhook.on('wheel', e => {
      const vertical = e.direction === WheelDirection.VERTICAL;
      const direction = vertical ? (e.rotation > 0 ? 'down' : 'up') : (e.rotation > 0 ? 'right' : 'left');
      onRaw({ type: 'wheel', x: e.x, y: e.y, direction });
    });
    uIOhook.on('keydown', e => {
      const info = keyMapper!(e);
      if (info.printable || info.combo || info.ends) onRaw({ type: 'key', ...info });
    });
  }
  return hook;
}

type RawInput =
  | { type: 'down' | 'up'; x: number; y: number; button: number }
  | { type: 'wheel'; x: number; y: number; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'key'; printable: boolean; combo: string | null; ends: boolean };

function onRaw(raw: RawInput) {
  const r = rec;
  if (!r || r.paused) return;
  const t = Date.now();
  const id = ++r.nextId;
  let ev: InputEvent;
  let physical: Point | null = null;
  if (raw.type === 'key') {
    ev = { type: 'key', id, t, printable: raw.printable, combo: raw.combo, ends: raw.ends };
  } else {
    physical = { x: raw.x, y: raw.y };
    const p = toDip(raw.x, raw.y);
    // 도구 막대 클릭, 녹화 영역 밖 클릭은 기록하지 않는다.
    if (inRect(p, r.toolbar.getBounds())) return;
    if (!inRect(p, r.region) && raw.type !== 'up') return;
    ev = raw.type === 'wheel' ? { type: 'wheel', id, t, ...p, direction: raw.direction } : { type: raw.type, id, t, ...p, button: raw.button };
  }

  if (r.frames.size > 60) { // 쓰이지 않은 오래된 프레임 정리
    for (const key of [...r.frames.keys()].slice(0, 30)) { r.frames.delete(key); r.elements.delete(key); }
  }
  if (r.classifier.needsFrame(ev)) {
    r.frames.set(id, invokeRenderer<string | null>(r.capture, 'cap:pin', { id, t }).catch(() => null));
    if (physical && ev.type !== 'key') r.elements.set(id, uia.elementAt(physical.x, physical.y));
  }
  const actions = r.classifier.push(ev);
  for (const a of actions) r.chain = r.chain.then(() => processAction(r, a)).catch(err => console.error('동작 처리 실패', err));
}

function labelFor(el: ElementInfo | null): string | undefined {
  return el ? safeLabel(el.name) : undefined;
}

async function processAction(r: Recording, a: DesktopAction) {
  const image = await (r.frames.get(a.frameId) ?? Promise.resolve(null));
  r.frames.delete(a.frameId);
  const el = await (r.elements.get(a.frameId) ?? Promise.resolve(null));
  r.elements.delete(a.frameId);
  if (!image) return;

  const elRect = el ? elementToDip(el) : null;
  let rect: [number, number, number, number] | null = null;
  const suggestedMasks: [number, number, number, number][] = [];
  let action: Record<string, unknown> = { kind: a.kind };

  if (a.kind === 'key') {
    action = { kind: 'key', keys: a.keys };
  } else if (a.kind === 'type' && !a.point) {
    action = { kind: 'type', inputType: 'text' };
  } else if ('point' in a && a.point) {
    const picked = pickElementRect(elRect, a.point, r.region);
    rect = a.kind === 'scroll' && !picked.fromElement ? [0.05, 0.05, 0.9, 0.9] : normalizeInRegion(picked.rect, r.region);
    if (a.kind === 'drag') {
      const toEl = await uia.elementAt(...physicalOf(a.to));
      const to = pickElementRect(toEl ? elementToDip(toEl) : null, a.to, r.region);
      action = { kind: 'drag', to: normalizeInRegion(to.rect, r.region) ?? rect };
    } else if (a.kind === 'type') {
      action = { kind: 'type', inputType: el?.isPassword ? 'password' : 'text' };
    } else if (a.kind === 'scroll') {
      action = { kind: 'scroll', direction: a.direction };
    }
  }
  if (el?.isPassword && rect) suggestedMasks.push(rect); // 비밀번호 칸은 기본으로 가림

  r.count++;
  deliver({
    image,
    rect,
    viewport: { width: Math.round(r.region.width), height: Math.round(r.region.height), dpr: r.display.scaleFactor },
    target: { tagName: el?.controlType || 'DESKTOP', label: labelFor(el) },
    suggestedMasks,
    action,
    source: 'desktop',
    timestamp: Date.now(),
  });
  broadcastState();
}

function physicalOf(p: Point): [number, number] {
  if (process.platform !== 'win32') return [p.x, p.y];
  const phys = screen.dipToScreenPoint(p);
  return [phys.x, phys.y];
}

// ---------- 녹화 시작/정지 ----------
async function startRecording(): Promise<{ ok: boolean; error?: string }> {
  if (rec) return { ok: true };
  const permissionError = await ensurePermissions();
  if (permissionError) return { ok: false, error: permissionError };

  editorWin?.minimize();
  const selection = await selectRegion();
  if (!selection) {
    editorWin?.restore();
    return { ok: false, error: '녹화를 취소했습니다.' };
  }
  const { display, region } = selection;

  let capture: BrowserWindow | null = null;
  try {
    capture = await startCapture(display, region);
    const toolbar = createToolbar(display, region);
    rec = {
      display, region, classifier: new ActionClassifier(), paused: false, count: 0, capture, toolbar,
      frames: new Map(), elements: new Map(), chain: Promise.resolve(), nextId: 0,
    };
    uia.start();
    loadHook().uIOhook.start();
    globalShortcut.register('CommandOrControl+Shift+F8', togglePause);
    globalShortcut.register('CommandOrControl+Shift+F9', () => { void stopRecording(); });
    toolbar.webContents.once('did-finish-load', broadcastState);
    broadcastState();
    return { ok: true };
  } catch (err) {
    capture?.destroy();
    rec?.toolbar.destroy();
    rec = null;
    editorWin?.restore();
    return { ok: false, error: (err as Error).message };
  }
}

function togglePause() {
  if (!rec) return;
  rec.paused = !rec.paused;
  broadcastState();
}

async function stopRecording() {
  const r = rec;
  if (!r) return;
  rec = null; // 이후 입력은 무시
  try { hook?.uIOhook.stop(); } catch { /* 이미 멈춤 */ }
  globalShortcut.unregisterAll();
  for (const a of r.classifier.finish()) r.chain = r.chain.then(() => processAction(r, a));
  await r.chain.catch(() => {});

  // 마지막 결과 화면을 종료 단계로 보낸다.
  const last = await invokeRenderer<string | null>(r.capture, 'cap:now', {}).catch(() => null);
  if (last) {
    deliver({
      image: last, rect: null, viewport: { width: Math.round(r.region.width), height: Math.round(r.region.height), dpr: r.display.scaleFactor },
      target: null, suggestedMasks: [], action: null, source: 'desktop', timestamp: Date.now(),
    });
  }
  r.capture.destroy();
  r.toolbar.destroy();
  broadcastState();
  if (editorWin) {
    editorWin.restore();
    editorWin.focus();
  }
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.on('editor:ready', e => {
    if (e.sender !== editorWin?.webContents) return;
    editorReady = true;
    while (queue.length) sendToEditor('rec:capture', queue.shift());
    broadcastState();
  });
  ipcMain.handle('rec:start', e => (e.sender === editorWin?.webContents ? startRecording() : { ok: false }));
  ipcMain.handle('rec:stop', async e => { if (e.sender === editorWin?.webContents) await stopRecording(); });
  ipcMain.on('toolbar:pause', e => { if (rec && e.sender === rec.toolbar.webContents) togglePause(); });
  ipcMain.on('toolbar:stop', e => { if (rec && e.sender === rec.toolbar.webContents) void stopRecording(); });
}

// 화면 캡처 창만 화면 스트림을 쓸 수 있게 하고, 나머지 권한 요청은 거절한다.
function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && mediaAllowed.has(wc.id));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!wc && mediaAllowed.has(wc.id));
}

app.whenReady().then(async () => {
  await offerMoveToApplications();
  serveApp();
  restrictPermissions();
  registerIpc();
  createEditor();
  app.on('activate', () => { if (!editorWin) createEditor(); });
});

app.on('window-all-closed', () => {
  if (rec) void stopRecording();
  uia.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { hook?.uIOhook.stop(); } catch { /* 무시 */ }
  uia.stop();
});
