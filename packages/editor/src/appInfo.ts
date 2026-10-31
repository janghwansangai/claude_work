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
