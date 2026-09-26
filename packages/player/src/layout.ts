import type { CSSProperties } from 'react';
import type { Rect } from '@walksim/shared';

export interface Box { width: number; height: number }
/** 이미지 상자(px) 좌표계에서 현재 화면에 보이는 영역. 확대(zoom) 시 이미지 상자가 화면보다 커진다. */
export interface Visible { x: number; y: number; width: number; height: number }

export const rectStyle = ([x, y, w, h]: Rect): CSSProperties => ({
  left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
});

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
