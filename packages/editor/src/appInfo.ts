import { useEffect, useState } from 'react';
import { APP_AUTHOR, APP_NAME, bugReportUrl } from '@walksim/shared/feedback';
import { desktop, isExtensionPage } from './captureSource';

// 프로그램 정보와 오류 신고. 편집기에는 검수 전 원본 캡처가 있으므로 외부 스크립트(신고 위젯)를 넣지 않고,
// 기본 브라우저(새 탭)로 오류 신고 페이지를 연다. 주소에는 버전과 화면 이름만 붙인다.
export { APP_AUTHOR, APP_NAME };

export const appVersion: string =
  (desktop as { version?: string } | undefined)?.version
  ?? (isExtensionPage ? chrome.runtime.getManifest().version : 'dev');

const surface = desktop ? '데스크톱 앱' : isExtensionPage ? '크롬 확장 편집기' : '편집기(개발)';

export function openBugReport(screen: string) {
  window.open(bugReportUrl(appVersion, `${surface} · ${screen}`), '_blank', 'noopener');
}

// ---------- 새 버전 알림(크롬 확장) ----------
// 직접 설치한(압축해제) 확장은 스스로 업데이트할 수 없으므로, 하루 한 번 GitHub에 올라간 최신 버전 번호만 확인해 알려 준다.
// 보내는 정보는 없다(공개 파일 하나를 읽기만 함). 데스크톱 앱은 앱이 직접 업데이트한다.
const LATEST_MANIFEST = 'https://raw.githubusercontent.com/janghwansangai/claude_work/main/packages/recorder/public/manifest.json';
export const RELEASES_LATEST = 'https://github.com/janghwansangai/claude_work/releases/latest';
const CHECK_KEY = 'walksim-update-check';
const DAY = 24 * 60 * 60 * 1000;

export function isNewer(a: string, b: string): boolean {
  const p = (v: string) => v.split('.').map(n => Number.parseInt(n, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

export function useExtensionUpdate(): string | null {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    if (!isExtensionPage) return;
    let cached: { at: number; version: string } | null = null;
    try { cached = JSON.parse(localStorage.getItem(CHECK_KEY) ?? 'null'); } catch { /* 무시 */ }
    const show = (v: string) => { if (isNewer(v, appVersion)) setLatest(v); };
    if (cached && Date.now() - cached.at < DAY && Date.now() >= cached.at) { show(cached.version); return; }
    const controller = new AbortController();
    fetch(LATEST_MANIFEST, { signal: controller.signal, credentials: 'omit', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((m: { version?: unknown } | null) => {
        if (typeof m?.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version)) return;
        try { localStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now(), version: m.version })); } catch { /* 무시 */ }
        show(m.version);
      })
      .catch(() => { /* 오프라인 등: 조용히 넘어간다 */ });
    return () => controller.abort();
  }, []);
  return latest;
}
