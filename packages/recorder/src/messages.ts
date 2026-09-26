export type Rect = [number, number, number, number];

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface TargetInfo {
  tagName: string;
  role?: string;
  label?: string;
}

// 콘텐츠 스크립트 → 백그라운드
export interface PageSettledMessage {
  action: 'PAGE_SETTLED';
  seq: number;
  viewport: Viewport;
  suggestedMasks: Rect[];
}

export interface UserActionMessage {
  action: 'USER_ACTION';
  frameSeq: number | null; // 클릭 직전 화면이 안정 상태였으면 그 프레임 번호
  rect: Rect;
  target: TargetInfo;
  viewport: Viewport;
  suggestedMasks: Rect[];
}

// 백그라운드 → 에디터. 원본 이미지를 담고 있으므로 WalkSim 에디터 외에는 절대 보내지 않는다.
export interface CapturePayload {
  image: string;
  rect: Rect | null;
  viewport: Viewport;
  target: TargetInfo | null;
  suggestedMasks: Rect[];
  timestamp: number;
}

export const EDITOR_PATH = 'editor/index.html';
