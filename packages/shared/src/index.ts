import { z } from 'zod';

// [x, y, w, h] — 캡처 이미지(콘텐츠 영역) 기준 0~1 정규화 좌표
export const RectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Rect = z.infer<typeof RectSchema>;

// 배포 패키지 내부의 상대 경로만 허용한다. 외부 URL, data:, javascript:, 절대 경로는 금지.
export const AssetPathSchema = z.string().min(1).refine(
  p => !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('/') && !p.includes('\\') && !/[\u0000-\u001f]/.test(p),
  { message: '자산 경로는 배포 패키지 내부의 상대 경로여야 합니다.' },
);

export const ClickStepSchema = z.object({
  id: z.string(),
  type: z.literal('click'),
  assetId: z.string(),
  instruction: z.string(),
  hotspots: z.array(z.object({
    id: z.string(),
    rect: RectSchema,
    nextStepId: z.string()
  })),
  hint: z.string().optional()
});

export const InputStepSchema = z.object({
  id: z.string(),
  type: z.literal('input'),
  assetId: z.string(),
  instruction: z.string(),
  input: z.object({
    mode: z.string(),
    placeholder: z.string().optional(),
    acceptedValues: z.array(z.string()),
    storeInput: z.boolean().default(false)
  }),
  nextStepId: z.string(),
  hint: z.string().optional()
});

export const ChoiceStepSchema = z.object({
  id: z.string(),
  type: z.literal('choice'),
  assetId: z.string(),
  instruction: z.string(),
  choices: z.array(z.object({
    label: z.string(),
    nextStepId: z.string()
  })),
  hint: z.string().optional()
});

export const StepSchema = z.discriminatedUnion('type', [
  ClickStepSchema,
  InputStepSchema,
  ChoiceStepSchema
]);

export type Step = z.infer<typeof StepSchema>;

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
    case 'input': return [step.nextStepId];
    case 'choice': return step.choices.map(c => c.nextStepId);
  }
}

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
  if (reachable.size > 0 && !hasReachableEnd) warnings.push('도달 가능한 종료 단계(핫스팟 없는 클릭 단계)가 없습니다.');

  return { errors, warnings };
}
