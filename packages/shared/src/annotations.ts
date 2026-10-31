import { z } from 'zod';

// 교사가 장면 위에 직접 그리는 강조 표시(주석). 좌표는 이미지 기준 0~1 정규화.
// 이미지에 굽지 않고 학생 화면에서 겹쳐 그리므로 나중에 고치거나 지울 수 있다.
// 렌더링은 React에 의존하지 않는 "도형 목록"(annotationPrims)으로 만들어 에디터·플레이어가 똑같이 그린다.

const Num01 = z.number().min(-0.05).max(1.05);
const Point = z.tuple([Num01, Num01]);
const Box = z.tuple([Num01, Num01, z.number().min(0).max(1.1), z.number().min(0).max(1.1)]);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Id = z.string().min(1).max(40);

export const MAX_ANNOTATIONS = 200;

export const AnnotationSchema = z.discriminatedUnion('kind', [
  z.object({ id: Id, kind: z.literal('box'), rect: Box, color: Color }),
  z.object({ id: Id, kind: z.literal('ellipse'), rect: Box, color: Color }),
  z.object({ id: Id, kind: z.literal('arrow'), from: Point, to: Point, color: Color }),
  z.object({ id: Id, kind: z.literal('pen'), points: z.array(Point).min(2).max(600), color: Color }),
  z.object({ id: Id, kind: z.literal('highlight'), points: z.array(Point).min(2).max(600), color: Color }),
  z.object({ id: Id, kind: z.literal('text'), at: Point, text: z.string().min(1).max(200), color: Color, size: z.number().min(0.5).max(3).optional() }),
  z.object({ id: Id, kind: z.literal('badge'), at: Point, n: z.number().int().min(0).max(99), color: Color }),
]);

export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationKind = Annotation['kind'];

export const ANNOTATION_COLORS = ['#ef4444', '#f59e0b', '#facc15', '#2563eb', '#16a34a', '#ffffff', '#111827'] as const;
export const DEFAULT_ANNOTATION_COLOR = '#ef4444';
export const DEFAULT_HIGHLIGHT_COLOR = '#facc15';

export interface Prim {
  tag: 'rect' | 'ellipse' | 'line' | 'polyline' | 'polygon' | 'circle' | 'text';
  attrs: Record<string, string | number>;
  style?: Record<string, string | number>;
  text?: string;
}

interface Size { width: number; height: number }

const round = (n: number) => Math.round(n * 10) / 10;

/** 주석 하나를 픽셀 상자(box) 안의 SVG 도형 목록으로 바꾼다. 선 굵기·글자 크기는 상자 크기에 비례한다. */
export function annotationPrims(a: Annotation, box: Size): Prim[] {
  const u = Math.max(0.6, Math.sqrt(box.width * box.height) / 1000);
  const sw = round(Math.max(2, 4 * u));
  const X = (n: number) => round(n * box.width);
  const Y = (n: number) => round(n * box.height);
  const stroke = { fill: 'none', stroke: a.color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const pts = (points: [number, number][]) => points.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');

  switch (a.kind) {
    case 'box': {
      const [x, y, w, h] = a.rect;
      return [{ tag: 'rect', attrs: { x: X(x), y: Y(y), width: X(w), height: Y(h), rx: round(4 * u), ...stroke } }];
    }
    case 'ellipse': {
      const [x, y, w, h] = a.rect;
      return [{ tag: 'ellipse', attrs: { cx: X(x + w / 2), cy: Y(y + h / 2), rx: X(w / 2), ry: Y(h / 2), ...stroke } }];
    }
    case 'arrow': {
      const x1 = X(a.from[0]), y1 = Y(a.from[1]), x2 = X(a.to[0]), y2 = Y(a.to[1]);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const head = Math.min(len * 0.6, 14 * u + sw * 2);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const bx = x2 - ux * head, by = y2 - uy * head;
      const half = head * 0.55;
      const p1 = `${round(bx - uy * half)},${round(by + ux * half)}`;
      const p2 = `${round(bx + uy * half)},${round(by - ux * half)}`;
      return [
        { tag: 'line', attrs: { x1, y1, x2: round(bx + ux * sw * 0.5), y2: round(by + uy * sw * 0.5), ...stroke } },
        { tag: 'polygon', attrs: { points: `${x2},${y2} ${p1} ${p2}`, fill: a.color, stroke: a.color, strokeWidth: round(sw / 2), strokeLinejoin: 'round' } },
      ];
    }
    case 'pen':
      return [{ tag: 'polyline', attrs: { points: pts(a.points), ...stroke } }];
    case 'highlight':
      return [{ tag: 'polyline', attrs: { points: pts(a.points), ...stroke, strokeWidth: round(22 * u), strokeOpacity: 0.42 } }];
    case 'text': {
      const size = round(22 * u * (a.size ?? 1));
      return [{
        tag: 'text',
        attrs: { x: X(a.at[0]), y: Y(a.at[1]), fontSize: size, fontWeight: 700, fill: a.color, stroke: a.color === '#ffffff' ? '#111827' : '#ffffff', strokeWidth: round(size * 0.22), dominantBaseline: 'hanging' },
        style: { paintOrder: 'stroke', fontFamily: 'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' },
        text: a.text,
      }];
    }
    case 'badge': {
      const r = round(15 * u);
      const cx = X(a.at[0]), cy = Y(a.at[1]);
      const light = a.color === '#ffffff' || a.color === '#facc15';
      return [
        { tag: 'circle', attrs: { cx, cy, r, fill: a.color, stroke: light ? '#111827' : '#ffffff', strokeWidth: round(Math.max(1.5, 2.5 * u)) } },
        {
          tag: 'text',
          attrs: { x: cx, y: cy, fontSize: round(r * (a.n >= 10 ? 1.05 : 1.25)), fontWeight: 800, fill: light ? '#111827' : '#ffffff', textAnchor: 'middle', dominantBaseline: 'central' },
          style: { fontFamily: 'system-ui, sans-serif' },
          text: String(a.n),
        },
      ];
    }
  }
}

/** 주석이 차지하는 대략적인 영역(정규화 좌표). 지우개 도구의 클릭 판정에 쓴다. */
export function annotationBounds(a: Annotation): [number, number, number, number] {
  switch (a.kind) {
    case 'box':
    case 'ellipse':
      return a.rect;
    case 'arrow':
      return spanOf([a.from, a.to]);
    case 'pen':
    case 'highlight':
      return spanOf(a.points);
    case 'text':
      return [a.at[0], a.at[1], Math.min(0.6, 0.017 * (a.size ?? 1) * a.text.length + 0.01), 0.04 * (a.size ?? 1)];
    case 'badge':
      return [a.at[0] - 0.02, a.at[1] - 0.03, 0.04, 0.06];
  }
}

function spanOf(points: [number, number][]): [number, number, number, number] {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

/** 다음에 놓을 번호 원의 숫자(지금 있는 번호 중 가장 큰 값 + 1). */
export function nextBadgeNumber(annotations: Annotation[] | undefined): number {
  const ns = (annotations ?? []).filter(a => a.kind === 'badge').map(a => (a as { n: number }).n);
  return ns.length ? Math.min(99, Math.max(...ns) + 1) : 1;
}
