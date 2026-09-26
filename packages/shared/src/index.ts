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

export interface GraphReport {
  errors: string[];   // 발행을 막아야 하는 문제
  warnings: string[]; // 교사 확인이 필요한 문제
}

// PRD §9.2: 시작점·링크·자산 존재, 도달 불가 단계와 종료점 부재를 검사한다.
export function validateManifestGraph(manifest: Manifest): GraphReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  for (const step of manifest.steps) {
    if (ids.has(step.id)) errors.push(`단계 ID가 중복됩니다: ${step.id}`);
    ids.add(step.id);
  }
  for (const step of manifest.steps) {
    if (step.type === 'input' && step.input.mode !== 'password-sample' && step.input.acceptedValues.length === 0) {
      warnings.push(`${step.id}: 입력 단계에 정답 값이 없어 아무 값이나 통과합니다.`);
    }
    if (step.type === 'choice' && step.choices.length === 0) errors.push(`${step.id}: 선택지가 없습니다.`);
  }
  if (manifest.steps.length === 0) {
    errors.push('단계가 하나도 없습니다.');
    return { errors, warnings };
  }
  if (!ids.has(manifest.startStepId)) errors.push(`시작 단계가 존재하지 않습니다: "${manifest.startStepId}"`);

  for (const step of manifest.steps) {
    if (!step.assetId) warnings.push(`${step.id}: 배경 이미지가 없습니다.`);
    else if (!(step.assetId in manifest.assets)) errors.push(`${step.id}: 자산 "${step.assetId}"이(가) assets에 없습니다.`);
    for (const next of nextStepIds(step)) {
      if (!next) errors.push(`${step.id}: 다음 단계가 연결되지 않은 동작이 있습니다.`);
      else if (!ids.has(next)) errors.push(`${step.id}: 존재하지 않는 단계로 연결됩니다 (${next}).`);
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
    if (!reachable.has(step.id)) warnings.push(`${step.id}: 시작 단계에서 도달할 수 없습니다.`);
  }
  if (reachable.size > 0 && !hasReachableEnd) warnings.push('도달 가능한 종료 단계(클릭 영역 없는 단계)가 없습니다.');

  return { errors, warnings };
}
