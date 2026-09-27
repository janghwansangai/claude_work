import { z } from 'zod';

// [x, y, w, h] — 캡처 이미지(콘텐츠 영역) 기준 0~1 정규화 좌표
export const RectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Rect = z.infer<typeof RectSchema>;

// 배포 패키지 내부의 상대 경로만 허용한다. 외부 URL, data:, javascript:, 절대 경로는 금지.
export const AssetPathSchema = z.string().min(1).refine(
  p => !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('/') && !p.includes('\\') && !/[\u0000-\u001f]/.test(p),
  { message: '자산 경로는 배포 패키지 내부의 상대 경로여야 합니다.' },
);

// 모든 단계의 공통 필드. zoom: 이 단계에서 확대해 보여 줄 영역(Arcade의 Pan & Zoom)
const StepBase = z.object({
  id: z.string(),
  assetId: z.string(),
  instruction: z.string(),
  hint: z.string().optional(),
  zoom: RectSchema.optional(),
});

export const ClickActionSchema = z.enum(['click', 'double', 'right']);
export type ClickAction = z.infer<typeof ClickActionSchema>;

export const ClickStepSchema = StepBase.extend({
  type: z.literal('click'),
  hotspots: z.array(z.object({
    id: z.string(),
    rect: RectSchema,
    nextStepId: z.string(),
    action: ClickActionSchema.optional(), // 없으면 'click'
  })),
});

// 가짜 입력. rect가 있으면 화면 속 입력칸 위치에 실제 입력창을 겹쳐 보여 준다.
// acceptedValues가 비어 있으면 비어 있지 않은 아무 값이나 정답. mode 'password-sample'은 연습용 가상 비밀번호만 채운다.
export const InputStepSchema = StepBase.extend({
  type: z.literal('input'),
  rect: RectSchema.optional(),
  input: z.object({
    mode: z.string(),
    placeholder: z.string().optional(),
    acceptedValues: z.array(z.string()),
    storeInput: z.boolean().default(false)
  }),
  nextStepId: z.string(),
});

export const ChoiceStepSchema = StepBase.extend({
  type: z.literal('choice'),
  choices: z.array(z.object({
    label: z.string(),
    nextStepId: z.string()
  })),
});

// 끌어서 놓기: from 영역을 잡아 to 영역에 놓는다.
export const DragStepSchema = StepBase.extend({
  type: z.literal('drag'),
  from: RectSchema,
  to: RectSchema,
  nextStepId: z.string(),
});

// 단축키: keys 중 하나를 누르면 정답. 예: ["Ctrl+S"]. 재생 시 Ctrl과 Cmd(⌘)는 같은 키로 인정한다.
export const KeyStepSchema = StepBase.extend({
  type: z.literal('key'),
  keys: z.array(z.string().min(1)).min(1),
  nextStepId: z.string(),
});

export const ScrollStepSchema = StepBase.extend({
  type: z.literal('scroll'),
  rect: RectSchema,
  direction: z.enum(['up', 'down', 'left', 'right']),
  nextStepId: z.string(),
});

export const StepSchema = z.discriminatedUnion('type', [
  ClickStepSchema,
  InputStepSchema,
  ChoiceStepSchema,
  DragStepSchema,
  KeyStepSchema,
  ScrollStepSchema,
]);

export type Step = z.infer<typeof StepSchema>;
export type StepType = Step['type'];

export const ManifestSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string(),
  version: z.string(),
  title: z.string(),
  notice: z.string(),
  mode: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
    dpr: z.number()
  }),
  startStepId: z.string(),
  assets: z.record(AssetPathSchema),
  steps: z.array(StepSchema)
});

export type Manifest = z.infer<typeof ManifestSchema>;

export function validateManifest(data: unknown): Manifest {
  return ManifestSchema.parse(data);
}

/** 단계가 이동할 수 있는 다음 단계 ID 목록. 빈 배열이면 종료 단계. */
export function nextStepIds(step: Step): string[] {
  switch (step.type) {
    case 'click': return step.hotspots.map(h => h.nextStepId);
    case 'choice': return step.choices.map(c => c.nextStepId);
    default: return [step.nextStepId];
  }
}

/** 단계의 모든 "다음 단계" 연결을 fn으로 바꾼 새 단계를 돌려준다. */
export function mapNextStepIds(step: Step, fn: (id: string) => string): Step {
  switch (step.type) {
    case 'click': return { ...step, hotspots: step.hotspots.map(h => ({ ...h, nextStepId: fn(h.nextStepId) })) };
    case 'choice': return { ...step, choices: step.choices.map(c => ({ ...c, nextStepId: fn(c.nextStepId) })) };
    default: return { ...step, nextStepId: fn(step.nextStepId) };
  }
}

/** 말풍선·편집 도구가 기준으로 삼는 단계의 대표 영역. */
export function stepAnchor(step: Step): Rect | undefined {
  switch (step.type) {
    case 'click': return step.hotspots[0]?.rect;
    case 'drag': return step.from;
    case 'input': return step.rect;
    case 'scroll': return step.rect;
    default: return undefined;
  }
}

export * from './keys';

export interface GraphIssue {
  level: 'error' | 'warning'; // error: 발행을 막아야 함, warning: 교사 확인 필요
  stepId?: string;            // 문제가 있는 단계(있으면 편집기에서 바로 이동)
  stepNumber?: number;        // 목록에서 보이는 단계 번호(1부터)
  message: string;
}

export interface GraphReport {
  issues: GraphIssue[];
  errors: string[];   // 발행을 막아야 하는 문제 (issues의 문구 모음)
  warnings: string[]; // 교사 확인이 필요한 문제
}

// PRD §9.2: 시작점·링크·자산 존재, 도달 불가 단계와 종료점 부재를 검사한다.
export function validateManifestGraph(manifest: Manifest): GraphReport {
  const issues: GraphIssue[] = [];
  const numberOf = new Map(manifest.steps.map((s, i) => [s.id, i + 1]));
  const add = (level: GraphIssue['level'], message: string, stepId?: string) => {
    const stepNumber = stepId ? numberOf.get(stepId) : undefined;
    issues.push({ level, stepId, stepNumber, message: stepNumber ? `${stepNumber}단계: ${message}` : message });
  };
  const ids = new Set<string>();

  for (const step of manifest.steps) {
    if (ids.has(step.id)) add('error', '단계 ID가 중복됩니다.', step.id);
    ids.add(step.id);
  }
  for (const step of manifest.steps) {
    if (step.type === 'input' && step.input.mode !== 'password-sample' && step.input.acceptedValues.length === 0) {
      add('warning', '입력 단계에 정답 값이 없어 아무 값이나 통과합니다.', step.id);
    }
    if (step.type === 'choice' && step.choices.length === 0) add('error', '선택지가 없습니다.', step.id);
  }
  if (manifest.steps.length === 0) {
    add('error', '단계가 하나도 없습니다.');
  } else {
    if (!ids.has(manifest.startStepId)) add('error', '시작 단계가 지정되지 않았습니다.');

    for (const step of manifest.steps) {
      if (!step.assetId) add('warning', '배경 이미지가 없습니다.', step.id);
      else if (!(step.assetId in manifest.assets)) add('error', '배경 이미지 파일이 프로젝트에 없습니다.', step.id);
      for (const next of nextStepIds(step)) {
        if (!next) add('error', '성공하면 이동할 단계가 연결되지 않았습니다.', step.id);
        else if (!ids.has(next)) add('error', '삭제된(존재하지 않는) 단계로 연결됩니다.', step.id);
      }
    }

    const byId = new Map(manifest.steps.map(s => [s.id, s]));
    const reachable = new Set<string>();
    const queue = ids.has(manifest.startStepId) ? [manifest.startStepId] : [];
    let hasReachableEnd = false;
    while (queue.length) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const next = nextStepIds(byId.get(id)!).filter(n => byId.has(n));
      if (nextStepIds(byId.get(id)!).length === 0) hasReachableEnd = true;
      queue.push(...next);
    }
    for (const step of manifest.steps) {
      if (!reachable.has(step.id)) add('warning', '시작 단계에서 이어지지 않아 학생이 볼 수 없습니다.', step.id);
    }
    if (reachable.size > 0 && !hasReachableEnd) add('warning', '도달 가능한 종료 단계(클릭 영역 없는 단계)가 없습니다.');
  }

  return {
    issues,
    errors: issues.filter(i => i.level === 'error').map(i => i.message),
    warnings: issues.filter(i => i.level === 'warning').map(i => i.message),
  };
}
