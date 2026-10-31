import { useEffect, useState } from 'react';
import { ANNOTATION_COLORS, DEFAULT_HIGHLIGHT_COLOR, isLinkUrl } from '@walksim/shared';
import { MARK_TOOLS, isMarkTool, type DrawTool } from './SceneCanvas';

const COLOR_NAME: Record<string, string> = {
  '#ef4444': '빨강', '#f59e0b': '주황', '#facc15': '노랑', '#2563eb': '파랑', '#16a34a': '초록', '#ffffff': '흰색', '#111827': '검정',
};

// 강조 그리기 도구: 네모·원·화살표·형광펜·그리기·글자·번호 원·지우개 + 색 + 다음 번호
export function MarkTools({ tool, onTool, color, onColor, badgeNumber, onBadgeNumber, count, onClearAll }: {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: string;
  onColor: (c: string) => void;
  badgeNumber: number;
  onBadgeNumber: (n: number) => void;
  count: number;
  onClearAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-md px-2 py-1.5">
      <span className="text-xs font-semibold text-gray-600 mr-1">강조 그리기</span>
      <div role="group" aria-label="강조 그리기 도구" className="flex flex-wrap gap-1">
        {MARK_TOOLS.map(m => (
          <button
            key={m.value}
            type="button"
            aria-pressed={tool === m.value}
            title={m.label}
            onClick={() => {
              onTool(m.value);
              if (m.value === 'highlight' && color === '#ef4444') onColor(DEFAULT_HIGHLIGHT_COLOR);
            }}
            className={`px-2 py-1 rounded text-sm border ${tool === m.value ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
          >
            <span aria-hidden className="mr-0.5">{m.icon}</span>{m.label}
          </button>
        ))}
      </div>
      {isMarkTool(tool) && tool !== 'erase' && (
        <div role="radiogroup" aria-label="색" className="flex gap-1 ml-1">
          {ANNOTATION_COLORS.map(c => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={COLOR_NAME[c] ?? c}
              title={COLOR_NAME[c] ?? c}
              onClick={() => onColor(c)}
              className={`w-6 h-6 rounded-full border ${color === c ? 'ring-2 ring-offset-1 ring-gray-800' : 'border-gray-300'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      {tool === 'badge' && (
        <label className="flex items-center gap-1 text-xs text-gray-600 ml-1">
          다음 번호
          <input
            type="number"
            min={0}
            max={99}
            value={badgeNumber}
            onChange={e => onBadgeNumber(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="w-14 border rounded px-1 py-0.5 text-sm"
            aria-label="다음 번호"
          />
        </label>
      )}
      <span className="flex-1" />
      {count > 0 && (
        <button type="button" onClick={onClearAll} className="text-xs text-red-600 underline">강조 {count}개 모두 지우기</button>
      )}
      <p className="w-full text-[11px] text-gray-500">
        {tool === 'text' ? '글자를 넣을 곳을 클릭하고 입력한 뒤 Enter.'
          : tool === 'badge' ? '누를 순서대로 클릭하면 ①②③… 번호 원이 차례로 놓입니다.'
          : tool === 'erase' ? '지울 강조 표시를 클릭하세요.'
          : isMarkTool(tool) ? '드래그해서 그립니다. 학생 화면에도 그대로 보이며(평가 모드 제외) 이미지에는 굽지 않습니다.'
          : '되돌리기 Ctrl/⌘+Z · 다시 실행 Ctrl/⌘+Shift+Z'}
      </p>
    </div>
  );
}

// 강조하기(실습 전체): 학생 화면의 마우스 표시·입력칸을 더 크고 눈에 띄게
export function EmphasisToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label
      className={`flex items-center gap-2 text-sm rounded-md border px-3 py-1.5 cursor-pointer ${on ? 'bg-yellow-50 border-yellow-400 text-yellow-900' : 'bg-white border-gray-300 text-gray-600'}`}
      title="켜면 학생 화면에서 모든 클릭 위치(마우스 표시)와 입력칸이 더 크고 눈에 띄게 보입니다. 실습 전체에 적용됩니다."
    >
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      🔍 강조하기 {on ? '켬' : '끔'}
    </label>
  );
}

/** 사용자가 입력한 주소를 정리한다. 앞에 https://가 없으면 붙인다. 쓸 수 없으면 null. */
export function normalizeLink(value: string): string | null {
  const v = value.trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`; // 'localhost:5300'처럼 포트만 있는 주소도 웹 주소로 본다
  return isLinkUrl(withScheme) && withScheme.length <= 2048 ? withScheme : null;
}

// 실제 사이트 주소(분할 화면에서 오른쪽에 열 링크)
export function LinkField({ value, onChange }: { value: string | undefined; onChange: (url: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(value ?? ''); setError(false); }, [value]);
  const commit = () => {
    const url = normalizeLink(draft);
    if (url === null) { setError(true); return; }
    setError(false);
    setDraft(url);
    if ((url || undefined) !== value) onChange(url || undefined);
  };
  return (
    <label className="block">
      <span className="font-semibold text-gray-800 text-sm">🔗 실제 사이트 주소 <span className="font-normal text-gray-500">(선택 · ‘실제 사이트와 나란히’ 화면에서 오른쪽에 열립니다)</span></span>
      <input
        type="url"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        placeholder="예: https://www.example.com/join"
        aria-label="실제 사이트 주소"
        className={`mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${error ? 'border-red-400' : ''}`}
      />
      {error && <span className="text-xs text-red-600">http:// 또는 https:// 로 시작하는 웹 주소만 쓸 수 있습니다.</span>}
      <span className="block text-[11px] text-gray-500 mt-0.5">학생에게 공개됩니다. 로그인 토큰·개인정보가 들어간 주소는 넣지 마세요.</span>
    </label>
  );
}
