import type { CSSProperties, ReactNode } from 'react';
import type { Rect } from '@walksim/shared';
import type { Box, Visible } from './layout';

// 누를 곳 표시: 퍼지는 원 + 마우스 모양 + (여러 버튼이면) 순서 번호. big=강조하기, dim=아직 차례가 아닌 버튼
export function Beacon({ label, order, big, dim, done }: { label?: string; order?: number; big?: boolean; dim?: boolean; done?: boolean }) {
  return (
    <span className={`absolute left-1/2 top-1/2 pointer-events-none ${dim ? 'opacity-50' : ''}`} aria-hidden>
      {!dim && !done && (
        <span className={`absolute rounded-full motion-safe:animate-ping ${big ? '-left-7 -top-7 w-14 h-14 bg-yellow-300/70' : '-left-4 -top-4 w-8 h-8 bg-blue-400/60'}`} />
      )}
      {done ? (
        <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-green-500 text-white text-sm font-bold flex items-center justify-center border-2 border-white shadow">✓</span>
      ) : (
        <span className={`absolute left-0 top-0 block origin-top-left ${big ? 'scale-[1.8]' : ''}`}>
          <svg width="20" height="24" viewBox="0 0 18 22" className="block drop-shadow-md -ml-[3px] -mt-[2px]">
            <path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.8 L9.6 12 L15.5 12 Z" fill="#fff" stroke="#111827" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {order !== undefined && (
            <span className="absolute -top-2 left-4 min-w-5 h-5 px-1 rounded-full bg-blue-600 text-white text-xs font-bold leading-5 text-center border-2 border-white shadow">{order}</span>
          )}
        </span>
      )}
      {label && !done && (
        <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded ${big ? 'top-12 text-sm' : 'top-7 text-[11px]'}`}>{label}</span>
      )}
    </span>
  );
}

// Arcade식 말풍선. 위치를 알려 줘도 되는 경우(안내 모드·위치 공개)에만 대상 옆에 붙이고,
// 그 외에는 정답 위치를 드러내지 않도록 화면 아래쪽에 고정한다.
export function Callout({ box, visible, anchor, above, big, children }: { box: Box; visible: Visible; anchor?: Rect; above?: boolean; big?: boolean; children: ReactNode }) {
  const width = Math.min(big ? 400 : 340, visible.width - 16);
  const minLeft = visible.x + 8;
  const maxLeft = visible.x + visible.width - width - 8;
  let style: CSSProperties;
  if (anchor) {
    const [x, y, w, h] = anchor;
    const bottomPx = (y + h) * box.height;
    const roomAbove = y * box.height - visible.y > 120;
    const below = above ? !roomAbove : bottomPx < visible.y + visible.height * 0.68;
    const left = Math.min(Math.max(minLeft, (x + w / 2) * box.width - width / 2), maxLeft);
    style = below ? { left, top: bottomPx + (above ? 44 : 14), width } : { left, bottom: box.height - y * box.height + 14, width };
  } else {
    style = { left: visible.x + (visible.width - width) / 2, bottom: box.height - (visible.y + visible.height) + 12, width };
  }
  return (
    <div className={`absolute z-20 bg-white text-gray-900 rounded-xl shadow-2xl px-4 py-3 motion-safe:animate-fadein ${big ? 'text-lg ring-4 ring-yellow-300' : ''}`} style={style} aria-live="polite">
      {children}
    </div>
  );
}

export function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 z-20">
      <div className="bg-white text-gray-900 rounded-xl shadow-2xl p-5 w-full max-w-sm text-center motion-safe:animate-fadein">{children}</div>
    </div>
  );
}

export function KeyCaps({ combo }: { combo: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {combo.split(' + ').map((k, i) => (
        <kbd key={i} className="min-w-7 px-1.5 py-0.5 text-center rounded-md border border-gray-300 border-b-[3px] bg-gray-50 text-gray-800 text-sm font-semibold font-sans">{k}</kbd>
      ))}
    </span>
  );
}
