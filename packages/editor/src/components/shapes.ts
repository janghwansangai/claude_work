import type { Rect, Step } from '@walksim/shared';
import type { RecordedAction } from '../project';
import type { Shape } from './RectCanvas';
import type { ToolOption } from './ToolToggle';

const PRIMARY_LABEL: Record<string, string> = {
  click: '클릭 영역', double: '더블클릭 영역', right: '오른쪽 클릭 영역', drag: '잡을 곳', type: '입력칸', input: '입력칸', scroll: '스크롤 영역',
};

export function stepShapes(step: Step): Shape[] {
  const shapes: Shape[] = [];
  switch (step.type) {
    case 'click':
      step.hotspots.forEach(h => shapes.push({ rect: h.rect, kind: 'hotspot', label: PRIMARY_LABEL[h.action ?? 'click'] }));
      break;
    case 'drag':
      shapes.push({ rect: step.from, kind: 'from', label: '잡을 곳' }, { rect: step.to, kind: 'to', label: '놓을 곳' });
      break;
    case 'input':
      if (step.rect) shapes.push({ rect: step.rect, kind: 'input', label: '입력칸' });
      break;
    case 'scroll':
      shapes.push({ rect: step.rect, kind: 'scroll', label: '스크롤 영역' });
      break;
  }
  if (step.zoom) shapes.push({ rect: step.zoom, kind: 'zoom', label: '확대 영역' });
  return shapes;
}

export function captureShapes(rect: Rect | null, action: RecordedAction | null): Shape[] {
  if (!rect) return [];
  const kind = action?.kind ?? 'click';
  if (kind === 'drag') {
    return [{ rect, kind: 'from', label: '잡을 곳' }, ...(action?.to ? [{ rect: action.to, kind: 'to' as const, label: '놓을 곳' }] : [])];
  }
  if (kind === 'type') return [{ rect, kind: 'input', label: '입력칸' }];
  if (kind === 'scroll') return [{ rect, kind: 'scroll', label: '스크롤 영역' }];
  return [{ rect, kind: 'hotspot', label: PRIMARY_LABEL[kind] ?? '클릭 영역' }];
}

export function stepTools(step: Step, maskLabel: string): ToolOption[] {
  const tools: ToolOption[] = [{ value: 'mask', label: maskLabel }];
  const primary = step.type === 'click' ? (step.hotspots[0] ? PRIMARY_LABEL[step.hotspots[0].action ?? 'click'] : '클릭 영역') : PRIMARY_LABEL[step.type];
  if (primary) tools.push({ value: 'primary', label: `${primary} 지정` });
  if (step.type === 'drag') tools.push({ value: 'target', label: '놓을 곳 지정' });
  tools.push({ value: 'zoom', label: '확대 영역' });
  return tools;
}

export function captureTools(rect: Rect | null, action: RecordedAction | null): ToolOption[] {
  const tools: ToolOption[] = [{ value: 'mask', label: '가림 상자 그리기' }];
  if (!rect) return tools;
  const kind = action?.kind ?? 'click';
  tools.push({ value: 'primary', label: `${PRIMARY_LABEL[kind] ?? '클릭 영역'} 지정` });
  if (kind === 'drag') tools.push({ value: 'target', label: '놓을 곳 지정' });
  return tools;
}
