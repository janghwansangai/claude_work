const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const startBtn = $<HTMLButtonElement>('start-btn');
const stopBtn = $<HTMLButtonElement>('stop-btn');
const editorBtn = $<HTMLButtonElement>('editor-btn');
const dummyCheck = $<HTMLInputElement>('dummy-check');
const statusEl = $('status');

let currentTabId: number | undefined;

function render(recordingTabId: number | null) {
  const recordingHere = recordingTabId !== null && recordingTabId === currentTabId;
  startBtn.hidden = recordingHere;
  stopBtn.hidden = !recordingHere;
  $('prep').hidden = recordingHere;
  startBtn.disabled = !dummyCheck.checked;
  startBtn.textContent = recordingTabId !== null && !recordingHere ? '이 탭으로 녹화 옮기기' : '이 탭 녹화 시작';
  statusEl.textContent = recordingHere ? '● 녹화 중 — 화면을 클릭하면 에디터 검수함으로 전달됩니다.' : '';
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;
  const state = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
  render(state?.recordingTabId ?? null);
}

dummyCheck.addEventListener('change', () => { startBtn.disabled = !dummyCheck.checked; });

startBtn.addEventListener('click', async () => {
  if (currentTabId === undefined) return;
  statusEl.textContent = '시작하는 중…';
  const res = await chrome.runtime.sendMessage({ action: 'START_RECORDING', tabId: currentTabId });
  if (!res?.ok) {
    statusEl.textContent = res?.error ?? '녹화를 시작하지 못했습니다.';
    return;
  }
  await refresh();
});

stopBtn.addEventListener('click', async () => {
  statusEl.textContent = '마지막 화면을 캡처하는 중…';
  await chrome.runtime.sendMessage({ action: 'STOP_RECORDING' });
  await refresh();
  statusEl.textContent = '녹화를 마쳤습니다. 에디터 검수함에서 확인하세요.';
});

editorBtn.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'OPEN_EDITOR' }));

void refresh();
