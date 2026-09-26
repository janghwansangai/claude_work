import { mapNextStepIds, nextStepIds, normalizeKeyCombo, stepAnchor, type Manifest, type Rect, type Step } from '@walksim/shared';

export type { Rect };

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface CaptureTarget {
  tagName: string;
  role?: string;
  label?: string;
}

// 레코더가 기록한 동작 종류. 입력값·키 입력 내용은 절대 담지 않는다(단축키 조합 이름만).
export interface RecordedAction {
  kind: 'click' | 'double' | 'right' | 'drag' | 'type' | 'key' | 'scroll';
  to?: Rect;          // drag: 놓은 곳
  direction?: 'up' | 'down' | 'left' | 'right'; // scroll
  keys?: string;      // key: "Ctrl+S" 형태
  inputType?: string; // type: text/email/password 등 입력칸 종류
}

export interface CapturePayload {
  image: string; // data:image/...;base64 — 마스킹 전 원본. 메모리에만 존재해야 한다.
  rect: Rect | null; // 클릭한 요소. 녹화 종료 화면이면 null
  viewport: Viewport | null;
  target: CaptureTarget | null;
  suggestedMasks: Rect[]; // 레코더가 찾은 민감정보 후보 영역(텍스트는 전달하지 않음)
  action: RecordedAction | null; // null이면 녹화 종료 화면(또는 구버전 레코더의 클릭)
  source: 'browser' | 'desktop';
  timestamp: number;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createInitialManifest(): Manifest {
  return {
    schemaVersion: 2,
    id: newId('project'),
    version: "1.0.0",
    title: "제목 없는 실습 프로젝트",
    notice: "모의 실습입니다. 실제 계정과 실제 비밀번호를 입력하지 마세요.",
    mode: "practice",
    viewport: { width: 1280, height: 720, dpr: 1 },
    startStepId: "",
    assets: {},
    steps: []
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function parseRect(value: unknown): Rect | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x, y, w, h] = value as number[];
  const left = clamp01(x), top = clamp01(y);
  const rect: Rect = [left, top, clamp01(x + w) - left, clamp01(y + h) - top];
  return rect[2] > 0 && rect[3] > 0 ? rect : null;
}

// postMessage/runtime 메시지로 들어온 데이터는 신뢰할 수 없으므로 형태를 검사한다.
export function parseCapturePayload(value: unknown): CapturePayload | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (typeof p.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p.image)) return null;
  if (typeof p.timestamp !== 'number' || !Number.isFinite(p.timestamp)) return null;

  const v = p.viewport as Record<string, unknown> | undefined;
  const viewport = v && [v.width, v.height, v.dpr].every(n => typeof n === 'number' && (n as number) > 0)
    ? { width: v.width as number, height: v.height as number, dpr: v.dpr as number }
    : null;

  const t = (p.target ?? {}) as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);
  const tagName = str(t.tagName, 20) ?? str(p.tagName, 20); // 구버전 레코더 호환
  const target = tagName ? { tagName, role: str(t.role, 20), label: str(t.label, 40) } : null;

  const suggestedMasks = Array.isArray(p.suggestedMasks)
    ? p.suggestedMasks.map(parseRect).filter((r): r is Rect => r !== null).slice(0, 100)
    : [];

  return { image: p.image, rect: parseRect(p.rect), viewport, target, suggestedMasks, action: parseAction(p.action), source: p.source === 'desktop' ? 'desktop' : 'browser', timestamp: p.timestamp };
}

const ACTION_KINDS = new Set(['click', 'double', 'right', 'drag', 'type', 'key', 'scroll']);
const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

function parseAction(value: unknown): RecordedAction | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  if (typeof a.kind !== 'string' || !ACTION_KINDS.has(a.kind)) return null;
  const action: RecordedAction = { kind: a.kind as RecordedAction['kind'] };
  if (action.kind === 'drag') {
    const to = parseRect(a.to);
    if (!to) return null;
    action.to = to;
  }
  if (action.kind === 'key') {
    if (typeof a.keys !== 'string' || !/^[\w+\-. ]{1,30}$/.test(a.keys)) return null;
    action.keys = normalizeKeyCombo(a.keys);
  }
  if (action.kind === 'type' && typeof a.inputType === 'string') action.inputType = a.inputType.slice(0, 20);
  if (action.kind === 'scroll') action.direction = typeof a.direction === 'string' && DIRECTIONS.has(a.direction) ? a.direction as RecordedAction['direction'] : 'down';
  return action;
}

// Arcade처럼 클릭한 요소의 이름과 동작으로 지시문 초안을 만든다. 교사가 검수함에서 반드시 확인·수정한다.
export function draftInstruction(capture: Pick<CapturePayload, 'rect' | 'target' | 'action'>): string {
  const { action } = capture;
  const label = capture.target?.label;
  const it = label ? `‘${label}’을(를)` : '표시된 곳을';
  if (action?.kind === 'key') return `${action.keys} 키를 누르세요.`;
  if (action?.kind === 'type' && !capture.rect) return '입력칸에 입력하세요.';
  if (!capture.rect) return '실습을 완료했습니다.';
  switch (action?.kind) {
    case 'double': return `${it} 더블클릭하세요.`;
    case 'right': return `${it} 마우스 오른쪽 버튼으로 클릭하세요.`;
    case 'drag': return `${it} 표시된 곳으로 끌어다 놓으세요.`;
    case 'scroll': return `${{ up: '위로', down: '아래로', left: '왼쪽으로', right: '오른쪽으로' }[action.direction ?? 'down']} 스크롤하세요.`;
    case 'type':
      if (action.inputType === 'password') return '비밀번호 칸을 채우세요. (연습용 비밀번호 사용)';
      return label ? `‘${label}’ 칸에 입력하세요.` : '입력칸에 입력하세요.';
    default: return `${it} 클릭하세요.`;
  }
}

export interface NewStepInput {
  assetId: string;
  assetPath: string;
  rect: Rect | null;
  action: RecordedAction | null;
  instruction: string;
  viewport: Viewport | null;
  placeholder?: string;
}

// 기록된 동작을 단계로 바꾼다. 다음 단계 연결은 비워 두고 appendStep이 이어 준다.
function stepFromCapture(input: NewStepInput): Step {
  const base = { id: newId('step'), assetId: input.assetId, instruction: input.instruction };
  const { action, rect } = input;
  if (action?.kind === 'key' && action.keys) return { ...base, type: 'key', keys: [action.keys], nextStepId: '' };
  if (action?.kind === 'type' && !rect) {
    return { ...base, type: 'input', nextStepId: '', input: { mode: 'text', placeholder: input.placeholder, acceptedValues: [], storeInput: false } };
  }
  if (!rect) return { ...base, type: 'click', hotspots: [] };
  switch (action?.kind) {
    case 'drag': return { ...base, type: 'drag', from: rect, to: action.to ?? rect, nextStepId: '' };
    case 'scroll': return { ...base, type: 'scroll', rect, direction: action.direction ?? 'down', nextStepId: '' };
    case 'type': return {
      ...base, type: 'input', rect, nextStepId: '',
      input: {
        mode: action.inputType === 'password' ? 'password-sample' : 'text',
        placeholder: action.inputType === 'password' ? undefined : input.placeholder,
        acceptedValues: [],
        storeInput: false,
      },
    };
    case 'double':
    case 'right':
      return { ...base, type: 'click', hotspots: [{ id: newId('hotspot'), rect, nextStepId: '', action: action.kind }] };
    default:
      return { ...base, type: 'click', hotspots: [{ id: newId('hotspot'), rect, nextStepId: '' }] };
  }
}

// 새 단계를 끝에 추가하고, 직전 단계의 연결되지 않은 동작을 새 단계로 연결한다.
export function appendStep(manifest: Manifest, input: NewStepInput): { manifest: Manifest; step: Step } {
  const step = stepFromCapture(input);
  const last = manifest.steps.length - 1;
  const steps = manifest.steps.map((s, i) => (i === last ? mapNextStepIds(s, id => id || step.id) : s));

  return {
    manifest: {
      ...manifest,
      startStepId: manifest.steps.length === 0 ? step.id : manifest.startStepId,
      viewport: manifest.steps.length === 0 && input.viewport ? input.viewport : manifest.viewport,
      assets: { ...manifest.assets, [input.assetId]: input.assetPath },
      steps: [...steps, step],
    },
    step,
  };
}

// 단계를 삭제하고, 그 단계로 오던 연결은 삭제된 단계의 다음 단계로 이어 붙인다.
export function deleteStep(manifest: Manifest, stepId: string): Manifest {
  const target = manifest.steps.find(s => s.id === stepId);
  if (!target) return manifest;
  const first = nextStepIds(target)[0] ?? '';
  const successor = first === stepId ? '' : first;
  const steps = manifest.steps.filter(s => s.id !== stepId).map(s => mapNextStepIds(s, id => (id === stepId ? successor : id)));
  const startStepId = manifest.startStepId === stepId ? (successor || steps[0]?.id || '') : manifest.startStepId;
  const assets = { ...manifest.assets };
  if (target.assetId && !steps.some(s => s.assetId === target.assetId)) delete assets[target.assetId];
  return { ...manifest, startStepId, steps, assets };
}

export type RectRole = 'primary' | 'target' | 'zoom';

// 단계의 영역을 바꾼다. primary: 클릭 영역/끌 대상/입력칸/스크롤 영역, target: 드래그 놓을 곳, zoom: 확대 영역
export function setStepRect(manifest: Manifest, stepId: string, role: RectRole, rect: Rect | undefined): Manifest {
  const index = manifest.steps.findIndex(s => s.id === stepId);
  const step = manifest.steps[index];
  if (!step) return manifest;
  let next: Step = step;
  if (role === 'zoom') next = { ...step, zoom: rect };
  else if (role === 'target' && step.type === 'drag' && rect) next = { ...step, to: rect };
  else if (role === 'primary') {
    switch (step.type) {
      case 'click':
        if (!rect) next = { ...step, hotspots: [] };
        else next = {
          ...step,
          hotspots: step.hotspots.length > 0
            ? [{ ...step.hotspots[0], rect }, ...step.hotspots.slice(1)]
            : [{ id: newId('hotspot'), rect, nextStepId: manifest.steps[index + 1]?.id ?? '' }],
        };
        break;
      case 'drag': if (rect) next = { ...step, from: rect }; break;
      case 'scroll': if (rect) next = { ...step, rect }; break;
      case 'input': next = { ...step, rect }; break;
    }
  }
  return { ...manifest, steps: manifest.steps.map(s => (s.id === stepId ? next : s)) };
}

// 편집기에서 고르는 "동작 종류". click/double/right는 같은 click 단계의 동작 값이다.
export type StepKind = 'click' | 'double' | 'right' | 'drag' | 'input' | 'key' | 'scroll' | 'choice' | 'end';

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  click: '클릭', double: '더블클릭', right: '오른쪽 클릭', drag: '끌어서 놓기', input: '글자 입력',
  key: '단축키', scroll: '스크롤', choice: '선택지(분기)', end: '종료 화면',
};

export function stepKind(step: Step): StepKind {
  if (step.type === 'click') return step.hotspots.length === 0 ? 'end' : step.hotspots[0].action ?? 'click';
  return step.type;
}

// 단계의 종류를 바꾼다. id·이미지·지시문·힌트·확대와 대표 영역·다음 연결은 최대한 유지한다.
export function convertStep(step: Step, kind: StepKind, fallbackNext: string): Step {
  const { id, assetId, instruction, hint, zoom } = step;
  const base = { id, assetId, instruction, hint, zoom };
  const rect: Rect = stepAnchor(step) ?? [0.4, 0.4, 0.2, 0.1];
  const next = nextStepIds(step).find(Boolean) ?? fallbackNext;
  switch (kind) {
    case 'click':
    case 'double':
    case 'right': {
      const h = step.type === 'click' ? step.hotspots[0] : undefined;
      return { ...base, type: 'click', hotspots: [{ id: h?.id ?? newId('hotspot'), rect, nextStepId: h?.nextStepId || next, ...(kind === 'click' ? {} : { action: kind }) }] };
    }
    case 'end': return { ...base, type: 'click', hotspots: [] };
    case 'drag': {
      const to: Rect = step.type === 'drag' ? step.to : [Math.min(0.8, rect[0] + 0.2), rect[1], rect[2], rect[3]];
      return { ...base, type: 'drag', from: rect, to, nextStepId: next };
    }
    case 'input': return { ...base, type: 'input', rect, nextStepId: next, input: { mode: 'text', acceptedValues: [], storeInput: false } };
    case 'key': return { ...base, type: 'key', keys: step.type === 'key' ? step.keys : ['Enter'], nextStepId: next };
    case 'scroll': return { ...base, type: 'scroll', rect: step.type === 'scroll' ? step.rect : [0.1, 0.15, 0.8, 0.7], direction: 'down', nextStepId: next };
    case 'choice': return { ...base, type: 'choice', choices: [{ label: '선택 1', nextStepId: next }] };
  }
}

// 브라우저가 가로채서 학생 화면에서 연습할 수 없는 단축키
const RESERVED = new Set(['Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Q', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Alt+F4', 'Ctrl+Shift+Q']);
export function isReservedShortcut(combo: string): boolean {
  return RESERVED.has(normalizeKeyCombo(combo));
}

// 단계의 배경 이미지를 교체한다(추가 마스킹 등). 더 이상 쓰이지 않는 자산 경로는 제거한다.
export function replaceStepAsset(manifest: Manifest, stepId: string, assetId: string, assetPath: string): Manifest {
  const old = manifest.steps.find(s => s.id === stepId)?.assetId;
  const steps = manifest.steps.map(s => (s.id === stepId ? { ...s, assetId } : s));
  const assets = { ...manifest.assets, [assetId]: assetPath };
  if (old && old !== assetId && !steps.some(s => s.assetId === old)) delete assets[old];
  return { ...manifest, steps, assets };
}
