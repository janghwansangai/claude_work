// 좌표 계산. 모든 입력 좌표는 DIP(논리 픽셀, Electron screen 좌표계) 기준이다.
import type { Point } from './actions';

export interface RectDip { x: number; y: number; width: number; height: number }
export type NormRect = [number, number, number, number];

export const inRect = (p: Point, r: RectDip) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;

/** 녹화 영역 기준 0~1 좌표로 바꾼다. 영역 밖으로 나간 부분은 잘라 내고, 완전히 밖이면 null. */
export function normalizeInRegion(rect: RectDip, region: RectDip): NormRect | null {
  const left = Math.max(rect.x, region.x);
  const top = Math.max(rect.y, region.y);
  const right = Math.min(rect.x + rect.width, region.x + region.width);
  const bottom = Math.min(rect.y + rect.height, region.y + region.height);
  if (right <= left || bottom <= top) return null;
  return [(left - region.x) / region.width, (top - region.y) / region.height, (right - left) / region.width, (bottom - top) / region.height];
}

export function normalizePoint(p: Point, region: RectDip): Point {
  return { x: (p.x - region.x) / region.width, y: (p.y - region.y) / region.height };
}

const DEFAULT_W = 80;
const DEFAULT_H = 40;

/** 요소 크기를 알 수 없을 때 클릭 지점 중심의 기본 상자 */
export function defaultBox(p: Point): RectDip {
  return { x: p.x - DEFAULT_W / 2, y: p.y - DEFAULT_H / 2, width: DEFAULT_W, height: DEFAULT_H };
}

/**
 * 접근성 API(UI Automation)가 알려 준 요소 상자를 쓸지 판단한다.
 * 클릭 지점을 포함하고, 너무 작거나(4px 미만) 영역의 40% 이상을 덮는 컨테이너가 아니어야 한다.
 * (유니티처럼 화면 전체가 하나의 요소로 보이는 프로그램은 기본 상자로 대체된다.)
 */
export function pickElementRect(element: RectDip | null, p: Point, region: RectDip): { rect: RectDip; fromElement: boolean } {
  if (element && element.width >= 4 && element.height >= 4 && inRect(p, element)
    && element.width * element.height < region.width * region.height * 0.4) {
    return { rect: element, fromElement: true };
  }
  return { rect: defaultBox(p), fromElement: false };
}

/** 화면(디스플레이) 스트림의 영상 픽셀 좌표에서 잘라 낼 부분 */
export function cropForDisplay(region: RectDip, display: RectDip, videoWidth: number, videoHeight: number) {
  const sx = videoWidth / display.width;
  const sy = videoHeight / display.height;
  const x = Math.max(0, Math.round((region.x - display.x) * sx));
  const y = Math.max(0, Math.round((region.y - display.y) * sy));
  return {
    sx: x,
    sy: y,
    sw: Math.min(videoWidth - x, Math.round(region.width * sx)),
    sh: Math.min(videoHeight - y, Math.round(region.height * sy)),
  };
}

/** 드래그한 사각형(두 점)을 정규화된 영역으로. 너무 작으면 null */
export function rectFromPoints(a: Point, b: Point, min = 40): RectDip | null {
  const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  return r.width >= min && r.height >= min ? r : null;
}
