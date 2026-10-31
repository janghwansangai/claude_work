import { createElement, useLayoutEffect, useRef, useState } from 'react';
import { annotationBounds, annotationPrims, type Annotation, type Rect } from '@walksim/shared';
import { MASK_COLOR } from '../imaging';
import { newId } from '../project';

// 장면 편집 표면: 이미지 위에 드래그로 영역(가림·클릭 영역·버튼·확대)을 지정하고,
// 강조 표시(네모·원·화살표·형광펜·펜·글자·번호 원)를 그린다. 좌표는 이미지 기준 0~1로 정규화한다.
// 컨테이너를 이미지 비율과 똑같이 맞추므로 letterbox 여백 때문에 좌표가 어긋나지 않는다.

export type AreaTool = 'mask' | 'primary' | 'target' | 'zoom' | 'button';
export type MarkTool = 'box' | 'ellipse' | 'arrow' | 'highlight' | 'pen' | 'text' | 'badge' | 'erase';
export type DrawTool = AreaTool | MarkTool;

export const MARK_TOOLS: { value: MarkTool; label: string; icon: string }[] = [
  { value: 'box', label: '네모', icon: '▢' },
  { value: 'ellipse', label: '원', icon: '◯' },
  { value: 'arrow', label: '화살표', icon: '↗' },
  { value: 'highlight', label: '형광펜', icon: '🖍' },
  { value: 'pen', label: '그리기', icon: '✎' },
  { value: 'text', label: '글자', icon: 'T' },
  { value: 'badge', label: '번호', icon: '①' },
  { value: 'erase', label: '지우개', icon: '⌫' },
];
export const isMarkTool = (t: DrawTool): t is MarkTool => MARK_TOOLS.some(m => m.value === t);

export type ShapeKind = 'hotspot' | 'from' | 'to' | 'input' | 'scroll' | 'zoom';
export interface Shape { rect: Rect; kind: ShapeKind; label: string; order?: number; onRemove?: () => void }

const SHAPE_STYLE: Record<ShapeKind, string> = {
  hotspot: 'border-2 border-blue-500 bg-blue-500/20',
  from: 'border-2 border-blue-500 bg-blue-500/20',
  to: 'border-2 border-dashed border-green-500 bg-green-500/15',
  input: 'border-2 border-purple-500 bg-purple-500/15',
  scroll: 'border-2 border-teal-500 bg-teal-500/10',
  zoom: 'border-2 border-dashed border-orange-500',
};
const SHAPE_TAG: Record<ShapeKind, string> = {
  hotspot: 'bg-blue-600', from: 'bg-blue-600', to: 'bg-green-600', input: 'bg-purple-600', scroll: 'bg-teal-600', zoom: 'bg-orange-500',
};
const AREA_DRAFT: Record<AreaTool, string> = {
  mask: 'border-red-500 bg-gray-900/70',
  primary: 'border-blue-500 bg-blue-500/20',
  button: 'border-blue-500 bg-blue-500/20',
  target: 'border-green-500 bg-green-500/20',
  zoom: 'border-orange-500 bg-orange-500/10',
};

interface Props {
  src: string | null;
  masks: Rect[];
  shapes: Shape[];
  tool: DrawTool;
  onDraw: (rect: Rect) => void;            // 영역 도구로 그린 사각형
  onRemoveMask?: (index: number) => void;
  annotations?: Annotation[];
  onAddAnnotation?: (a: Annotation) => void;
  onRemoveAnnotation?: (id: string) => void;
  color?: string;
  badgeNumber?: number;
  emphasis?: boolean;                      // 강조하기 미리보기
  emptyText?: string;
}

type Pt = { x: number; y: number };
type Draft = { kind: 'rect'; a: Pt; b: Pt } | { kind: 'line'; a: Pt; b: Pt } | { kind: 'path'; points: [number, number][] };

const pct = (n: number) => `${n * 100}%`;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const rectOf = (a: Pt, b: Pt): Rect => [r4(Math.min(a.x, b.x)), r4(Math.min(a.y, b.y)), r4(Math.abs(b.x - a.x)), r4(Math.abs(b.y - a.y))];

export function AnnotationSvg({ annotations, width, height }: { annotations: Annotation[]; width: number; height: number }) {
  if (!width || !height || annotations.length === 0) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {annotations.flatMap(a => annotationPrims(a, { width, height }).map((p, i) =>
        createElement(p.tag, { key: `${a.id}-${i}`, ...p.attrs, style: p.style }, p.text)))}
    </svg>
  );
}

export function SceneCanvas({
  src, masks, shapes, tool, onDraw, onRemoveMask, annotations = [], onAddAnnotation, onRemoveAnnotation,
  color = '#ef4444', badgeNumber = 1, emphasis, emptyText,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [text, setText] = useState('');

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);

  const toPoint = (e: React.PointerEvent): Pt => {
    const box = surfaceRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) };
  };

  const commitText = () => {
    if (textAt && text.trim()) onAddAnnotation?.({ id: newId('a'), kind: 'text', at: [r4(textAt.x), r4(textAt.y)], text: text.trim().slice(0, 200), color });
    setTextAt(null);
    setText('');
  };

  if (!src) {
    return (
      <div className="aspect-video bg-gray-200 rounded flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-500 text-sm p-4 text-center">
        {emptyText ?? '이미지가 없습니다.'}
      </div>
    );
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = toPoint(e);
    if (tool === 'text') return; // 글자 칸은 click에서 연다(mousedown의 포커스 이동 뒤에 열어야 바로 입력된다)
    if (tool === 'badge') {
      onAddAnnotation?.({ id: newId('a'), kind: 'badge', at: [r4(p.x), r4(p.y)], n: badgeNumber, color });
      return;
    }
    if (tool === 'erase') {
      const pad = 0.015;
      const hit = [...annotations].reverse().find(a => {
        const [x, y, w, h] = annotationBounds(a);
        return p.x >= x - pad && p.x <= x + w + pad && p.y >= y - pad && p.y <= y + h + pad;
      });
      if (hit) onRemoveAnnotation?.(hit.id);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pen' || tool === 'highlight') setDraft({ kind: 'path', points: [[r4(p.x), r4(p.y)]] });
    else if (tool === 'arrow') setDraft({ kind: 'line', a: p, b: p });
    else setDraft({ kind: 'rect', a: p, b: p });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = toPoint(e);
    if (draft.kind === 'path') {
      const [lx, ly] = draft.points[draft.points.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) > 0.004 && draft.points.length < 600) setDraft({ kind: 'path', points: [...draft.points, [r4(p.x), r4(p.y)]] });
    } else {
      setDraft({ ...draft, b: p });
    }
  };

  const onUp = () => {
    const d = draft;
    setDraft(null);
    if (!d) return;
    if (d.kind === 'path') {
      if (d.points.length >= 2) onAddAnnotation?.({ id: newId('a'), kind: tool === 'highlight' ? 'highlight' : 'pen', points: d.points, color });
      return;
    }
    if (d.kind === 'line') {
      if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) > 0.015) {
        onAddAnnotation?.({ id: newId('a'), kind: 'arrow', from: [r4(d.a.x), r4(d.a.y)], to: [r4(d.b.x), r4(d.b.y)], color });
      }
      return;
    }
    const rect = rectOf(d.a, d.b);
    if (rect[2] <= 0.004 || rect[3] <= 0.004) return;
    if (tool === 'box' || tool === 'ellipse') onAddAnnotation?.({ id: newId('a'), kind: tool, rect, color });
    else onDraw(rect);
  };

  // 그리는 중인 강조 표시 미리보기
  let preview: Annotation | null = null;
  if (draft?.kind === 'path' && draft.points.length >= 2) preview = { id: 'draft', kind: tool === 'highlight' ? 'highlight' : 'pen', points: draft.points, color };
  if (draft?.kind === 'line') preview = { id: 'draft', kind: 'arrow', from: [draft.a.x, draft.a.y], to: [draft.b.x, draft.b.y], color };
  if (draft?.kind === 'rect' && (tool === 'box' || tool === 'ellipse')) preview = { id: 'draft', kind: tool, rect: rectOf(draft.a, draft.b), color };
  const areaDraft = draft?.kind === 'rect' && !isMarkTool(tool) ? rectOf(draft.a, draft.b) : null;

  return (
    <div className="relative w-full bg-gray-900 rounded overflow-hidden select-none" style={{ aspectRatio: aspect }} data-testid="scene-canvas">
      <img
        src={src}
        alt="캡처 화면"
        draggable={false}
        onLoad={e => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div
        ref={surfaceRef}
        className={`absolute inset-0 touch-none ${tool === 'text' ? 'cursor-text' : tool === 'erase' ? 'cursor-pointer' : 'cursor-crosshair'}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDraft(null)}
        onClick={e => {
          if (tool !== 'text' || textAt || e.target !== e.currentTarget && (e.target as HTMLElement).tagName === 'INPUT') return;
          const box = surfaceRef.current!.getBoundingClientRect();
          setTextAt({ x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) });
        }}
      >
        {masks.map((m, i) => (
          <div key={i} className="absolute group" style={{ left: pct(m[0]), top: pct(m[1]), width: pct(m[2]), height: pct(m[3]), background: MASK_COLOR }}>
            {onRemoveMask && <RemoveButton label={`가림 ${i + 1} 해제`} title="가림 해제" onClick={() => onRemoveMask(i)} />}
          </div>
        ))}

        <AnnotationSvg annotations={preview ? [...annotations, preview] : annotations} width={size.width} height={size.height} />

        {shapes.map((shape, i) => (
          <div
            key={i}
            className={`absolute rounded group ${shape.onRemove ? '' : 'pointer-events-none'} ${SHAPE_STYLE[shape.kind]} ${emphasis && (shape.kind === 'hotspot' || shape.kind === 'input' || shape.kind === 'from') ? 'ring-4 ring-yellow-300 ring-offset-2 ring-offset-transparent' : ''}`}
            style={{ left: pct(shape.rect[0]), top: pct(shape.rect[1]), width: pct(shape.rect[2]), height: pct(shape.rect[3]) }}
            data-testid={`shape-${shape.kind}`}
          >
            <span className={`absolute ${shape.rect[1] < 0.05 ? 'top-0' : '-top-5'} left-0 text-[10px] text-white px-1 rounded whitespace-nowrap ${SHAPE_TAG[shape.kind]}`}>
              {shape.order ? `${shape.order}. ` : ''}{shape.label}
            </span>
            {shape.kind === 'hotspot' && <CursorMark order={shape.order} big={emphasis} />}
            {shape.onRemove && <RemoveButton label={`${shape.label} ${shape.order ?? ''} 삭제`} title="삭제" onClick={shape.onRemove} />}
          </div>
        ))}

        {areaDraft && (
          <div
            className={`absolute border-2 border-dashed pointer-events-none ${AREA_DRAFT[tool as AreaTool]}`}
            style={{ left: pct(areaDraft[0]), top: pct(areaDraft[1]), width: pct(areaDraft[2]), height: pct(areaDraft[3]) }}
          />
        )}

        {textAt && (
          <input
            autoFocus
            value={text}
            maxLength={200}
            aria-label="강조 글자 입력"
            placeholder="글자 입력 후 Enter"
            onPointerDown={e => e.stopPropagation()}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') { setTextAt(null); setText(''); }
            }}
            onBlur={commitText}
            className="absolute z-10 min-w-40 px-2 py-1 rounded border-2 border-blue-500 bg-white text-gray-900 text-sm shadow"
            style={{ left: pct(Math.min(textAt.x, 0.8)), top: pct(Math.min(textAt.y, 0.93)) }}
          />
        )}
      </div>
    </div>
  );
}

function RemoveButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      onPointerDown={e => e.stopPropagation()}
      onClick={onClick}
      className="pointer-events-auto absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-xs leading-5 text-center opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      ×
    </button>
  );
}

// 학생 화면에 나오는 "마우스 + 순서 번호" 표시 미리보기
export function CursorMark({ order, big }: { order?: number; big?: boolean }) {
  return (
    <span className={`absolute left-1/2 top-1/2 pointer-events-none ${big ? 'scale-150' : ''}`} aria-hidden>
      <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow">
        <path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.8 L9.6 12 L15.5 12 Z" fill="#fff" stroke="#111827" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {order !== undefined && (
        <span className="absolute -top-2 left-3.5 min-w-4 h-4 px-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-4 text-center border border-white">{order}</span>
      )}
    </span>
  );
}
