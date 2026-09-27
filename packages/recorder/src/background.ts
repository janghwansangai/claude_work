import { EDITOR_PATH, type CapturePayload, type PageSettledMessage, type Rect, type UserActionMessage, type Viewport } from './messages';

// MV3 서비스 워커는 언제든 종료될 수 있으므로 녹화 상태는 chrome.storage.session에 둔다(PRD §6.2, [C2]).
// 원본 캡처(프레임·대기열)는 메모리에만 두며 디스크에 쓰지 않는다.

const MIN_CAPTURE_GAP_MS = 550; // captureVisibleTab은 초당 최대 2회
const EDITOR_URL = chrome.runtime.getURL(EDITOR_PATH);

interface Frame { tabId: number; seq: number; image: string; viewport: Viewport; suggestedMasks: Rect[] }
interface SessionState { recordingTabId?: number; devEditorTabId?: number }

// 최근 안정 화면 몇 장을 번호(seq)별로 보관한다. 더블클릭·입력처럼 동작 판별이 조금 늦게 끝나도 "직전 화면"을 쓸 수 있다.
const MAX_FRAMES = 6;
let frames: Frame[] = [];
const latestFrame = (tabId: number) => [...frames].reverse().find(f => f.tabId === tabId) ?? null;
// 탭이 비활성이라 찍지 못한 "안정 화면". 탭이 다시 활성화되면 그때 찍는다.
let missedSettle: { tabId: number; msg: PageSettledMessage } | null = null;
let captureChain: Promise<unknown> = Promise.resolve();
let lastCaptureAt = 0;
const pending: CapturePayload[] = [];

const getState = () => chrome.storage.session.get(['recordingTabId', 'devEditorTabId']) as Promise<SessionState>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function setBadge(tabId: number | undefined, text: string, color = '#dc2626') {
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
}

// 녹화 중인 탭이 그 창의 활성 탭일 때만 캡처한다. (교사가 다른 탭을 보고 있으면 그 탭을 찍으면 안 된다.)
function captureTab(tabId: number): Promise<string | null> {
  const run = async () => {
    const wait = MIN_CAPTURE_GAP_MS - (Date.now() - lastCaptureAt);
    if (wait > 0) await sleep(wait);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.active) return null;
    lastCaptureAt = Date.now();
    try {
      return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 92 });
    } catch (err) {
      console.warn('캡처 실패:', err);
      setBadge(tabId, '!');
      return null;
    }
  };
  const result = captureChain.then(run);
  captureChain = result.catch(() => {});
  return result;
}

async function findEditorTab(): Promise<number | undefined> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] });
  return contexts.find(c => c.documentUrl?.startsWith(EDITOR_URL))?.tabId;
}

async function openEditor(focus: boolean) {
  const tabId = await findEditorTab();
  if (tabId !== undefined && tabId >= 0) {
    if (focus) {
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: EDITOR_URL, active: focus });
}

// 원본 캡처는 확장 프로그램 내부 에디터(또는 개발용으로 등록된 localhost 에디터)에만 전달한다.
async function sendToEditor(payload: CapturePayload): Promise<boolean> {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'NEW_CAPTURE', payload });
    if (res?.received) return true;
  } catch { /* 열린 에디터 페이지 없음 */ }

  const { devEditorTabId } = await getState();
  if (typeof devEditorTabId === 'number') {
    try {
      const res = await chrome.tabs.sendMessage(devEditorTabId, { action: 'NEW_CAPTURE', payload });
      if (res?.received) return true;
    } catch {
      await chrome.storage.session.remove('devEditorTabId');
    }
  }
  return false;
}

async function deliver(payload: CapturePayload) {
  if (pending.length === 0 && await sendToEditor(payload)) return;
  pending.push(payload);
  await openEditor(false);
}

async function flushPending() {
  while (pending.length > 0) {
    if (!await sendToEditor(pending[0])) return;
    pending.shift();
  }
}

async function injectRecorder(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

async function startRecording(tabId: number): Promise<{ ok: boolean; error?: string }> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url?.startsWith('http') && tab?.url !== undefined) {
    return { ok: false, error: '일반 웹페이지(http/https)에서만 녹화할 수 있습니다.' };
  }
  try {
    await injectRecorder(tabId);
  } catch (err) {
    return { ok: false, error: `이 페이지에는 녹화기를 넣을 수 없습니다. (${(err as Error).message})` };
  }
  await chrome.storage.session.set({ recordingTabId: tabId });
  frames = [];
  setBadge(tabId, 'REC');
  await openEditor(false);
  return { ok: true };
}

async function stopRecording() {
  const { recordingTabId } = await getState();
  await chrome.storage.session.remove('recordingTabId');
  if (recordingTabId === undefined) return;
  setBadge(recordingTabId, '');
  chrome.tabs.sendMessage(recordingTabId, { action: 'STOP_CONTENT' }).catch(() => {});

  // 마지막 동작의 결과 화면을 종료 단계로 보낸다.
  const last = latestFrame(recordingTabId);
  const image = await captureTab(recordingTabId) ?? last?.image ?? null;
  frames = [];
  if (image && last) {
    await deliver({ image, rect: null, viewport: last.viewport, target: null, suggestedMasks: last.suggestedMasks, action: null, timestamp: Date.now() });
  }
}

async function onPageSettled(tabId: number, msg: PageSettledMessage) {
  const image = await captureTab(tabId);
  if (image) {
    frames = [...frames.filter(f => !(f.tabId === tabId && f.seq === msg.seq)), { tabId, seq: msg.seq, image, viewport: msg.viewport, suggestedMasks: msg.suggestedMasks }].slice(-MAX_FRAMES);
    missedSettle = null;
  } else {
    missedSettle = { tabId, msg };
  }
}

async function onUserAction(tabId: number, msg: UserActionMessage) {
  // 동작 직전의 "안정된 화면"을 쓴다. 없거나 낡았으면(화면이 바뀌는 중이었으면) 지금 즉시 찍는다.
  const fresh = msg.frameSeq === null ? null : frames.find(f => f.tabId === tabId && f.seq === msg.frameSeq) ?? null;
  const image = fresh?.image ?? await captureTab(tabId);
  if (!image) return;
  await deliver({
    image,
    rect: msg.rect,
    viewport: msg.viewport,
    target: msg.target,
    suggestedMasks: fresh?.suggestedMasks ?? msg.suggestedMasks,
    action: msg.recorded,
    timestamp: Date.now(),
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const fromTab = sender.tab?.id;

  switch (msg?.action) {
    case 'START_RECORDING':
      startRecording(msg.tabId).then(sendResponse);
      return true;
    case 'STOP_RECORDING':
      stopRecording().then(() => sendResponse({ ok: true }));
      return true;
    case 'GET_STATE':
      getState().then(s => sendResponse({ recordingTabId: s.recordingTabId ?? null }));
      return true;
    case 'OPEN_EDITOR':
      openEditor(true).then(() => sendResponse({ ok: true }));
      return true;
    case 'EDITOR_READY':
      // 확장 내부 에디터 페이지, 또는 개발용 localhost 에디터의 브릿지(콘텐츠 스크립트)
      if (!sender.url?.startsWith(EDITOR_URL) && fromTab !== undefined) {
        chrome.storage.session.set({ devEditorTabId: fromTab });
      }
      void flushPending();
      return;
    case 'PAGE_SETTLED':
    case 'USER_ACTION':
      getState().then(({ recordingTabId }) => {
        if (fromTab === undefined || fromTab !== recordingTabId) return;
        if (msg.action === 'PAGE_SETTLED') void onPageSettled(fromTab, msg);
        else void onUserAction(fromTab, msg);
      });
      return;
  }
});

// 페이지가 이동하면 주입한 스크립트가 사라지므로 다시 넣는다.
// 다른 사이트로 이동해 activeTab 권한이 풀리면 실패하며, 교사가 아이콘을 다시 눌러 이어서 녹화한다.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  const { recordingTabId } = await getState();
  if (tabId !== recordingTabId) return;
  if (info.status === 'loading') {
    frames = frames.filter(f => f.tabId !== tabId);
    if (missedSettle?.tabId === tabId) missedSettle = null;
  }
  if (info.status === 'complete') {
    try {
      await injectRecorder(tabId);
      setBadge(tabId, 'REC');
    } catch {
      setBadge(tabId, '!');
      chrome.action.setTitle({ tabId, title: '실습 녹화기: 페이지가 바뀌어 녹화가 멈췄습니다. 아이콘을 눌러 계속하세요.' }).catch(() => {});
    }
  }
});

// 교사가 에디터 등 다른 탭을 보다가 녹화 탭으로 돌아오면, 놓친 안정 화면을 지금 찍는다.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (missedSettle?.tabId === tabId) void onPageSettled(tabId, missedSettle.msg);
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const { recordingTabId, devEditorTabId } = await getState();
  if (tabId === recordingTabId) { await chrome.storage.session.remove('recordingTabId'); frames = []; }
  if (tabId === devEditorTabId) await chrome.storage.session.remove('devEditorTabId');
});
