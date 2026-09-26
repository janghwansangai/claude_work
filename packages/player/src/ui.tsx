import type { CSSProperties, ReactNode } from 'react';
import type { Rect } from '@walksim/shared';
import type { Box, Visible } from './layout';

export function Beacon({ label }: { label?: string }) {
  return (
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center" aria-hidden>
      <span className="absolute -inset-3 rounded-full bg-blue-400/60 motion-safe:animate-ping" />
      <span className="relative block w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow" />
      {label && <span className="absolute top-5 whitespace-nowrap text-[11px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded">{label}</span>}
    </span>
  );
}

// Arcade식 말풍선. 위치를 알려 줘도 되는 경우(안내 모드·위치 공개)에만 대상 옆에 붙이고,
// 그 외에는 정답 위치를 드러내지 않도록 화면 아래쪽에 고정한다.
export function Callout({ box, visible, anchor, above, children }: { box: Box; visible: Visible; anchor?: Rect; above?: boolean; children: ReactNode }) {
  const width = Math.min(340, visible.width - 16);
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
    <div className="absolute z-20 bg-white text-gray-900 rounded-xl shadow-2xl px-4 py-3 motion-safe:animate-fadein" style={style} aria-live="polite">
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
