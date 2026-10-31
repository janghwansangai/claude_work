// 오류 신고·개선 제안: 제작자의 오류 취합 센터(Google Apps Script 웹앱)로 연결한다.
// 비밀 키는 필요 없다. 화면 이름과 버전만 붙이며, 개인정보·프로젝트 내용·캡처는 절대 넣지 않는다.
export const APP_ID = 'practicerecorder';
export const APP_NAME = '실습 녹화기';
export const APP_AUTHOR = '다있쌤 로디';
export const BUG_REPORT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxsRD7vRlEP9oKlvlDDPww8cYaDadTTIp1KrqYWSVU5qE5_gUh3bNUskBhHDlXH6FskvA/exec';

/** 기본 브라우저로 열 오류 신고 주소. version·where는 모르면 비워도 된다. */
export function bugReportUrl(version?: string, where?: string): string {
  const params = new URLSearchParams({ app: APP_ID });
  if (version) params.set('v', version);
  if (where) params.set('where', where);
  return `${BUG_REPORT_ENDPOINT}?${params.toString()}`;
}
