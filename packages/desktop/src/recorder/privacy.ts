// 요소 이름(버튼 글자 등)을 지시문 초안에 쓰기 전에 개인정보처럼 보이는 것은 버린다.
const PII = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/,
  /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/,
  /\b0\d{1,2}-\d{3,4}-\d{4}\b/,
  /\b\d{6}[-\s]?[1-4]\d{6}\b/,
  /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/,
  /\d{5,}/,
];

export function safeLabel(name: string | undefined): string | undefined {
  const label = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!label || PII.some(p => p.test(label))) return undefined;
  return label;
}
