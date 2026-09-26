// 매니페스트 위치 결정 (서버 요청 없이 정적 파일만 사용)
//  - ?lesson=<id>          → play/<id>/manifest.json
//  - /play/<id>/ 경로의 페이지 → 같은 폴더의 manifest.json (PRD §9.1 배포 구조)
//  - 그 외(개발 서버)        → play/sample-drive/manifest.json
export function resolveManifestUrl(location: Location = window.location): URL {
  const base = new URL(import.meta.env.BASE_URL, location.href);
  const lesson = new URLSearchParams(location.search).get('lesson');
  if (lesson && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(lesson)) return new URL(`play/${lesson}/manifest.json`, base);
  if (/\/play\/[^/]+\/(index\.html)?$/.test(location.pathname)) return new URL('manifest.json', location.href);
  return new URL('play/sample-drive/manifest.json', base);
}

// 자산 경로는 매니페스트 기준 상대 경로이며, 다른 출처(외부 URL)로 벗어나면 사용하지 않는다.
export function resolveAssetUrl(path: string | undefined, manifestUrl: URL): string {
  if (!path) return '';
  const url = new URL(path, manifestUrl);
  return url.origin === manifestUrl.origin ? url.href : '';
}
