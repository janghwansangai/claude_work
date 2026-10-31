import { createElement } from 'react';
import { annotationPrims, type Annotation } from '@walksim/shared';
import type { Box } from './layout';

// 교사가 그린 강조 표시(네모·원·화살표·형광펜·펜·글자·번호 원). 클릭을 가로채지 않는다.
export function AnnotationLayer({ annotations, box }: { annotations: Annotation[] | undefined; box: Box }) {
  if (!annotations?.length || !box.width) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-[5]" viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden data-testid="annotations">
      {annotations.flatMap(a => annotationPrims(a, box).map((p, i) => createElement(p.tag, { key: `${a.id}-${i}`, ...p.attrs, style: p.style }, p.text)))}
    </svg>
  );
}
