import type { Manifest, Step } from '@walksim/shared';

export type Rect = [number, number, number, number];

export interface CapturePayload {
  image: string; // data:image/...;base64 (확장 프로그램이 captureVisibleTab으로 만든 JPEG)
  rect: Rect;
  tagName: string;
  timestamp: number;
}

export function createInitialManifest(): Manifest {
  return {
    schemaVersion: 2,
    id: `project-${Date.now()}`,
    version: "1.0.0",
    title: "제목 없는 실습 프로젝트",
    notice: "모의 실습입니다. 실제 계정과 실제 비밀번호를 입력하지 마세요.",
    mode: "practice",
    viewport: { width: 1280, height: 720, dpr: 1 },
    startStepId: "step-1",
    assets: {},
    steps: [
      {
        id: "step-1",
        type: "click",
        assetId: "",
        instruction: "첫 번째 단계 설명을 입력하세요.",
        hotspots: []
      }
    ]
  };
}

// postMessage로 들어온 데이터는 신뢰할 수 없으므로 형태를 검사한다.
export function parseCapturePayload(value: unknown): CapturePayload | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const rect = p.rect;
  if (typeof p.image !== 'string' || !p.image.startsWith('data:image/')) return null;
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  if (typeof p.timestamp !== 'number' || !Number.isFinite(p.timestamp)) return null;
  const tagName = typeof p.tagName === 'string' ? p.tagName : 'UNKNOWN';
  return { image: p.image, rect: rect as Rect, tagName, timestamp: p.timestamp };
}

// 캡처를 새 click 단계로 추가하고, 직전 단계의 비어 있는 핫스팟을 새 단계로 연결한다.
export function appendCaptureStep(
  manifest: Manifest,
  capture: Omit<CapturePayload, 'image'>,
  assetId: string,
): { manifest: Manifest; step: Step } {
  const { rect, tagName, timestamp } = capture;
  const newStep: Step = {
    id: `step-${timestamp}`,
    type: "click",
    assetId,
    instruction: `${tagName} 요소를 클릭했습니다. 지시사항을 입력하세요.`,
    hotspots: [
      {
        id: "hotspot-1",
        rect,
        nextStepId: ""
      }
    ]
  };

  const steps = manifest.steps.map((step, i): Step => {
    const isPrevious = i === manifest.steps.length - 1;
    if (isPrevious && step.type === 'click' && step.hotspots.length > 0 && !step.hotspots[0].nextStepId) {
      const [first, ...rest] = step.hotspots;
      return { ...step, hotspots: [{ ...first, nextStepId: newStep.id }, ...rest] };
    }
    return step;
  });

  return { manifest: { ...manifest, steps: [...steps, newStep] }, step: newStep };
}
