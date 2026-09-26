import type { Manifest, Rect, Step } from '@walksim/shared';

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

export interface CapturePayload {
  image: string; // data:image/...;base64 — 마스킹 전 원본. 메모리에만 존재해야 한다.
  rect: Rect | null; // 클릭한 요소. 녹화 종료 화면이면 null
  viewport: Viewport | null;
  target: CaptureTarget | null;
  suggestedMasks: Rect[]; // 레코더가 찾은 민감정보 후보 영역(텍스트는 전달하지 않음)
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

  return { image: p.image, rect: parseRect(p.rect), viewport, target, suggestedMasks, timestamp: p.timestamp };
}

// Arcade처럼 클릭한 요소의 이름으로 지시문 초안을 만든다. 교사가 검수함에서 반드시 확인·수정한다.
export function draftInstruction(capture: Pick<CapturePayload, 'rect' | 'target'>): string {
  if (!capture.rect) return '실습을 완료했습니다.';
  const label = capture.target?.label;
  if (label) return `‘${label}’을(를) 클릭하세요.`;
  return '표시된 곳을 클릭하세요.';
}

export interface NewStepInput {
  assetId: string;
  assetPath: string;
  rect: Rect | null;
  instruction: string;
  viewport: Viewport | null;
}

// 새 click 단계를 끝에 추가하고, 직전 단계의 연결되지 않은 핫스팟을 새 단계로 연결한다.
export function appendStep(manifest: Manifest, input: NewStepInput): { manifest: Manifest; step: Step } {
  const step: Step = {
    id: newId('step'),
    type: "click",
    assetId: input.assetId,
    instruction: input.instruction,
    hotspots: input.rect ? [{ id: newId('hotspot'), rect: input.rect, nextStepId: "" }] : []
  };

  const last = manifest.steps.length - 1;
  const steps = manifest.steps.map((s, i): Step => {
    if (i !== last || s.type !== 'click') return s;
    return { ...s, hotspots: s.hotspots.map(h => (h.nextStepId ? h : { ...h, nextStepId: step.id })) };
  });

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

function relink(step: Step, from: string, to: string): Step {
  switch (step.type) {
    case 'click': return { ...step, hotspots: step.hotspots.map(h => (h.nextStepId === from ? { ...h, nextStepId: to } : h)) };
    case 'input': return step.nextStepId === from ? { ...step, nextStepId: to } : step;
    case 'choice': return { ...step, choices: step.choices.map(c => (c.nextStepId === from ? { ...c, nextStepId: to } : c)) };
  }
}

function firstNext(step: Step): string {
  switch (step.type) {
    case 'click': return step.hotspots[0]?.nextStepId ?? '';
    case 'input': return step.nextStepId;
    case 'choice': return step.choices[0]?.nextStepId ?? '';
  }
}

// 단계를 삭제하고, 그 단계로 오던 연결은 삭제된 단계의 다음 단계로 이어 붙인다.
export function deleteStep(manifest: Manifest, stepId: string): Manifest {
  const target = manifest.steps.find(s => s.id === stepId);
  if (!target) return manifest;
  const successor = firstNext(target) === stepId ? '' : firstNext(target);
  const steps = manifest.steps.filter(s => s.id !== stepId).map(s => relink(s, stepId, successor));
  const startStepId = manifest.startStepId === stepId ? (successor || steps[0]?.id || '') : manifest.startStepId;
  const assets = { ...manifest.assets };
  if (target.assetId && !steps.some(s => s.assetId === target.assetId)) delete assets[target.assetId];
  return { ...manifest, startStepId, steps, assets };
}

// 클릭 단계의 첫 번째 핫스팟 위치를 바꾼다. 핫스팟이 없으면 목록상 다음 단계로 연결해 새로 만든다.
export function setHotspotRect(manifest: Manifest, stepId: string, rect: Rect): Manifest {
  const index = manifest.steps.findIndex(s => s.id === stepId);
  const step = manifest.steps[index];
  if (!step || step.type !== 'click') return manifest;
  const hotspots = step.hotspots.length > 0
    ? [{ ...step.hotspots[0], rect }, ...step.hotspots.slice(1)]
    : [{ id: newId('hotspot'), rect, nextStepId: manifest.steps[index + 1]?.id ?? '' }];
  const steps = manifest.steps.map(s => (s.id === stepId ? { ...step, hotspots } : s));
  return { ...manifest, steps };
}

// 단계의 배경 이미지를 교체한다(추가 마스킹 등). 더 이상 쓰이지 않는 자산 경로는 제거한다.
export function replaceStepAsset(manifest: Manifest, stepId: string, assetId: string, assetPath: string): Manifest {
  const old = manifest.steps.find(s => s.id === stepId)?.assetId;
  const steps = manifest.steps.map(s => (s.id === stepId ? { ...s, assetId } : s));
  const assets = { ...manifest.assets, [assetId]: assetPath };
  if (old && old !== assetId && !steps.some(s => s.assetId === old)) delete assets[old];
  return { ...manifest, steps, assets };
}
