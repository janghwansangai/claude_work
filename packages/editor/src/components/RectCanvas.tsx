import { useRef, useState } from 'react';
import type { Rect } from '@walksim/shared';
import { MASK_COLOR } from '../imaging';

export type DrawTool = 'mask' | 'hotspot';

interface Props {
  src: string | null;
  masks: Rect[];
  hotspot: Rect | null;
  tool: DrawTool;
  onDraw: (rect: Rect) => void;
  onRemoveMask?: (index: number) => void;
  emptyText?: string;
}

const pct = (n: number) => `${n * 100}%`;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// 이미지 위에 드래그로 사각형을 그리는 편집 표면. 좌표는 이미지 콘텐츠 기준 0~1로 정규화한다.
// 컨테이너를 이미지 비율과 똑같이 맞추므로 letterbox 여백 때문에 좌표가 어긋나지 않는다.
export function RectCanvas({ src, masks, hotspot, tool, onDraw, onRemoveMask, emptyText }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const toPoint = (e: React.PointerEvent) => {
    const box = surfaceRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) };
  };

  const draftRect = (d: NonNullable<typeof drag>): Rect => [
    Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0),
  ];

  if (!src) {
    return (
      <div className="aspect-video bg-gray-200 rounded flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-500 text-sm p-4 text-center">
        {emptyText ?? '이미지가 없습니다.'}
      </div>
    );
  }

  return (
    <div className="relative w-full bg-gray-900 rounded overflow-hidden select-none" style={{ aspectRatio: aspect }}>
      <img
        src={src}
        alt="캡처 화면"
        draggable={false}
        onLoad={e => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div
        ref={surfaceRef}
        className="absolute inset-0 cursor-crosshair touch-none"
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toPoint(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={e => {
          if (!drag) return;
          const p = toPoint(e);
          setDrag({ ...drag, x1: p.x, y1: p.y });
        }}
        onPointerUp={() => {
          if (!drag) return;
          const rect = draftRect(drag);
          setDrag(null);
          if (rect[2] > 0.004 && rect[3] > 0.004) onDraw(rect);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {masks.map((m, i) => (
          <div
            key={i}
            className="absolute group"
            style={{ left: pct(m[0]), top: pct(m[1]), width: pct(m[2]), height: pct(m[3]), background: MASK_COLOR }}
          >
            {onRemoveMask && (
              <button
                type="button"
                title="가림 해제"
                aria-label={`가림 ${i + 1} 해제`}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onRemoveMask(i)}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-xs leading-5 text-center opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {hotspot && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/20 rounded pointer-events-none"
            style={{ left: pct(hotspot[0]), top: pct(hotspot[1]), width: pct(hotspot[2]), height: pct(hotspot[3]) }}
          >
            <span className="absolute -top-5 left-0 text-[10px] bg-blue-600 text-white px-1 rounded">클릭 영역</span>
          </div>
        )}
        {drag && (() => {
          const r = draftRect(drag);
          return (
            <div
              className={`absolute border-2 border-dashed pointer-events-none ${tool === 'mask' ? 'border-red-500 bg-gray-900/70' : 'border-blue-500 bg-blue-500/20'}`}
              style={{ left: pct(r[0]), top: pct(r[1]), width: pct(r[2]), height: pct(r[3]) }}
            />
          );
        })()}
      </div>
    </div>
  );
}
