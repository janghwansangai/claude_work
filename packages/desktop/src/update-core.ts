// 업데이트 판단에 쓰는 순수 함수(단위 테스트 대상). 네트워크·Electron에 의존하지 않는다.

export const RELEASES_URL = 'https://github.com/janghwansangai/claude_work/releases';
export const TAG_PREFIX = 'desktop-v';

/** "1.2.10" 같은 버전을 비교한다. a가 더 새로우면 양수. 숫자가 아닌 꼬리(-beta 등)는 무시한다. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[.-]/).slice(0, 3).map(n => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** releases/latest 리다이렉트 주소(…/releases/tag/desktop-v1.2.0)에서 버전을 꺼낸다. */
export function versionFromReleaseUrl(url: string): string | null {
  const m = /\/releases\/tag\/([^/?#]+)/.exec(url);
  if (!m) return null;
  const tag = decodeURIComponent(m[1]);
  if (!tag.startsWith(TAG_PREFIX)) return null;
  const version = tag.slice(TAG_PREFIX.length);
  return /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

/** 맥 설치 파일(DMG) 직접 내려받기 주소. CPU 종류(arm64/x64)에 맞춘다. */
export function macDownloadUrl(version: string, arch: string): string {
  const a = arch === 'arm64' ? 'arm64' : 'x64';
  return `${RELEASES_URL}/download/${TAG_PREFIX}${version}/PracticeRecorder-Mac-${a}-${version}.dmg`;
}

/** 자동 확인은 하루에 한 번까지만 한다(학교처럼 여러 PC가 한 인터넷 주소를 쓰는 곳에서 요청이 몰리지 않게). */
export function shouldAutoCheck(lastCheckedAt: number | undefined, now: number, intervalMs = 24 * 60 * 60 * 1000): boolean {
  return !lastCheckedAt || now - lastCheckedAt >= intervalMs || now < lastCheckedAt;
}
