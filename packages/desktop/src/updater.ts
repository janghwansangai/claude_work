// 자동 업데이트.
//  - Windows: GitHub 릴리스의 새 버전을 백그라운드로 내려받아(electron-updater), 다 받으면 "지금 다시 시작해 설치 / 끌 때 설치"를 묻는다.
//  - macOS: 유료 개발자 인증서가 없는 앱은 스스로 교체할 수 없으므로, 새 버전을 알리고 DMG 내려받기를 연다.
//  - 자동 확인은 하루 한 번(설정에서 끌 수 있음). 녹화 중에는 묻지 않고 녹화가 끝난 뒤 알린다.
//  - 보내는 정보 없음: GitHub의 공개 릴리스 정보를 읽기만 한다.
import { app, dialog, net, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions, macDownloadUrl, RELEASES_URL, shouldAutoCheck, versionFromReleaseUrl } from './update-core';

interface Settings { auto: boolean; lastCheckedAt?: number; skipped?: string }
const SIX_HOURS = 6 * 60 * 60 * 1000;

let isBusy: () => boolean = () => false;
let waiting: (() => void) | null = null; // 녹화가 끝나면 보여 줄 안내

const settingsFile = () => path.join(app.getPath('userData'), 'update-settings.json');
function loadSettings(): Settings {
  try { return { auto: true, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { return { auto: true }; }
}
function saveSettings(patch: Partial<Settings>) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...loadSettings(), ...patch })); } catch { /* 설정 저장 실패는 무시 */ }
}

export const autoUpdateEnabled = () => loadSettings().auto;
export const setAutoUpdateEnabled = (auto: boolean) => saveSettings({ auto });
export const supported = () => app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');

/** 녹화 중이면 미뤘다가 녹화가 끝난 뒤 보여 준다. */
function whenIdle(show: () => void) {
  if (isBusy()) waiting = show;
  else show();
}
export function onIdle() {
  const show = waiting;
  waiting = null;
  show?.();
}

export function initUpdates(busy: () => boolean) {
  isBusy = busy;
  if (!supported()) return;
  const auto = () => {
    const s = loadSettings();
    if (s.auto && shouldAutoCheck(s.lastCheckedAt, Date.now())) void checkForUpdates(false);
  };
  setTimeout(auto, 15_000);
  setInterval(auto, SIX_HOURS).unref();
}

export async function checkForUpdates(manual: boolean) {
  if (!supported()) {
    if (manual) void dialog.showMessageBox({ type: 'info', message: '이 실행 방식에서는 업데이트를 확인하지 않습니다.', detail: '설치한 실습 녹화기(Windows·Mac)에서 확인할 수 있습니다.' });
    return;
  }
  saveSettings({ lastCheckedAt: Date.now() });
  try {
    if (process.platform === 'win32') await checkWindows(manual);
    else await checkMac(manual);
  } catch (err) {
    console.error('업데이트 확인 실패:', err);
    if (manual) void dialog.showMessageBox({ type: 'warning', message: '업데이트를 확인하지 못했습니다.', detail: `인터넷 연결을 확인한 뒤 다시 시도하세요.\n직접 받기: ${RELEASES_URL}/latest` });
  }
}

const upToDate = () => dialog.showMessageBox({ type: 'info', message: '최신 버전입니다.', detail: `지금 버전: ${app.getVersion()}` });

// ---------- Windows: 내려받아 설치 ----------
type Updater = typeof import('electron-updater').autoUpdater;
let updater: Updater | null = null;

function getUpdater(): Updater {
  if (updater) return updater;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // "나중에"를 고르면 프로그램을 끌 때 설치된다
  autoUpdater.logger = null;
  autoUpdater.on('update-downloaded', info => whenIdle(() => { void askRestart(info.version); }));
  autoUpdater.on('error', err => console.error('업데이트 오류:', err));
  updater = autoUpdater;
  return autoUpdater;
}

async function askRestart(version: string) {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '업데이트 준비 완료',
    message: `새 버전 ${version}이(가) 준비되었습니다.`,
    detail: '지금 다시 시작하면 설치됩니다. 작업 중인 프로젝트와 검수 전 캡처는 자동 저장되어 있습니다.\n‘나중에’를 고르면 프로그램을 끌 때 설치됩니다.',
    buttons: ['지금 다시 시작해 설치', '나중에'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) setImmediate(() => getUpdater().quitAndInstall(false, true));
}

async function checkWindows(manual: boolean) {
  const result = await getUpdater().checkForUpdates();
  const available = !!result && result.isUpdateAvailable;
  if (!manual) return;
  if (!available) { await upToDate(); return; }
  await dialog.showMessageBox({
    type: 'info',
    message: `새 버전 ${result!.updateInfo.version}을(를) 내려받고 있습니다.`,
    detail: '다 받으면 설치할지 물어봅니다. 그동안 계속 작업해도 됩니다.',
  });
}

// ---------- macOS: 알림 + 내려받기 ----------
async function latestVersion(): Promise<string | null> {
  // releases/latest 는 최신 릴리스 태그 주소로 넘어간다(GitHub API 호출 제한을 쓰지 않는다).
  const res = await net.fetch(`${RELEASES_URL}/latest`, { method: 'HEAD' });
  return versionFromReleaseUrl(res.url);
}

async function checkMac(manual: boolean) {
  const latest = await latestVersion();
  const current = app.getVersion();
  if (!latest || compareVersions(latest, current) <= 0) { if (manual) await upToDate(); return; }
  if (!manual && loadSettings().skipped === latest) return;
  whenIdle(async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '새 버전',
      message: `새 버전 ${latest}이(가) 나왔습니다. (지금 ${current})`,
      detail: '‘내려받기’를 누르면 설치 파일(DMG)을 받습니다. 받은 DMG를 열고 실습 녹화기를 응용 프로그램 폴더로 끌어 덮어쓰세요.\n'
        + '업데이트 뒤 화면 기록 권한을 다시 물으면 안내 창의 ‘권한 다시 설정’을 누르면 됩니다. 저장된 프로젝트는 그대로 남습니다.',
      buttons: ['내려받기', '다음에', '이 버전 건너뛰기'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void shell.openExternal(macDownloadUrl(latest, process.arch));
    if (response === 2) saveSettings({ skipped: latest });
  });
}
