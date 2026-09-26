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

// 기록하는 것은 동작의 "종류"뿐이다. 입력한 글자·값은 담지 않는다(단축키는 조합 이름만).
export interface RecordedAction {
  kind: 'click' | 'double' | 'right' | 'drag' | 'type' | 'key';
  to?: Rect;
  keys?: string;
  inputType?: string;
}

export interface UserActionMessage {
  action: 'USER_ACTION';
  frameSeq: number | null; // 동작 직전 화면이 안정 상태였으면 그 프레임 번호
  rect: Rect | null;       // 단축키는 null
  recorded: RecordedAction;
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
  action: RecordedAction | null; // null: 녹화 종료 화면
  timestamp: number;
}

export const EDITOR_PATH = 'editor/index.html';
