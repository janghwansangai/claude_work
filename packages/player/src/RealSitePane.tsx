import { useEffect, useState } from 'react';
import { isLinkUrl } from '@walksim/shared';

// 실제 사이트와 나란히: 왼쪽은 안내(실습 화면), 오른쪽은 실제 사이트.
// 사이트에 따라 다른 화면 안에 끼워 넣는 것을 막아(X-Frame-Options 등) 빈 화면이 될 수 있다.
// 그럴 때는 새 창으로 열고 크롬의 '분할 보기'로 나란히 놓도록 안내한다.

export function normalizeAddress(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  return isLinkUrl(withScheme) ? withScheme : null;
}

export function RealSitePane({ url, onNavigate, onClose }: { url: string | null; onNavigate: (url: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(url ?? '');
  const [reload, setReload] = useState(0);
  const [tip, setTip] = useState(true);
  useEffect(() => { setDraft(url ?? ''); }, [url]);

  const go = () => {
    const next = normalizeAddress(draft);
    if (next) onNavigate(next);
  };

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-white border-l-4 border-gray-950" aria-label="실제 사이트">
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-100 border-b text-gray-800">
        <span className="text-xs font-semibold text-gray-500 shrink-0">실제 사이트</span>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') go(); }}
          placeholder="주소를 입력하고 Enter"
          aria-label="실제 사이트 주소"
          className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-gray-300 bg-white"
        />
        <button onClick={() => setReload(r => r + 1)} disabled={!url} title="새로 고침" aria-label="새로 고침" className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30">⟳</button>
        <button onClick={() => url && window.open(url, '_blank', 'noopener')} disabled={!url} title="새 창(탭)에서 열기" className="px-2 py-1 rounded hover:bg-gray-200 text-sm whitespace-nowrap disabled:opacity-30">↗ 새 창</button>
        <button onClick={onClose} title="나란히 보기 닫기" aria-label="나란히 보기 닫기" className="px-2 py-1 rounded hover:bg-gray-200">✕</button>
      </div>
      {tip && (
        <p className="text-xs bg-amber-50 text-amber-900 border-b border-amber-200 px-3 py-1.5 flex gap-2 items-start">
          <span className="flex-1">
            실제 사이트이므로 <b>내 계정으로 실제로 동작합니다.</b> 사이트에 따라 이 칸 안에 열리지 않을 수 있어요(빈 화면).
            그럴 때는 <b>↗ 새 창</b>을 누르고, 크롬에서 새 탭을 마우스 오른쪽 버튼으로 눌러 <b>‘분할 보기에 탭 추가’</b>로 나란히 놓으세요.
          </span>
          <button onClick={() => setTip(false)} aria-label="안내 닫기" className="text-amber-700">✕</button>
        </p>
      )}
      {url ? (
        <iframe
          key={`${url}#${reload}`}
          src={url}
          title="실제 사이트"
          className="flex-1 w-full bg-white"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-6 text-center">
          왼쪽 안내의 <b className="mx-1">🔗 실제 사이트 열기</b>를 누르거나 위에 주소를 입력하세요.
        </div>
      )}
    </section>
  );
}
