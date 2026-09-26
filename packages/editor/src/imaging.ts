import type { Rect } from '@walksim/shared';

// 개인정보 가림은 반드시 픽셀 자체를 불투명 단색으로 덮어쓴다(PRD §7.2). 블러·반투명 금지.
export const MASK_COLOR = '#111827';
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 0.82;

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  hash: string; // SHA-256 hex (내용 기반 파일명·중복 제거용)
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// 마스크를 픽셀에 굽고 WebP로 인코딩한다. WebP를 지원하지 않으면 PNG(무손실)로 대체한다.
export async function burnMasks(source: Blob, masks: Rect[]): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    // 경계의 안티앨리어싱으로 글자 가장자리가 남지 않도록 바깥쪽으로 1px 여유를 둔다.
    ctx.globalAlpha = 1;
    ctx.fillStyle = MASK_COLOR;
    for (const [x, y, w, h] of masks) {
      const left = Math.max(0, Math.floor(x * width) - 1);
      const top = Math.max(0, Math.floor(y * height) - 1);
      const right = Math.min(width, Math.ceil((x + w) * width) + 1);
      const bottom = Math.min(height, Math.ceil((y + h) * height) + 1);
      ctx.fillRect(left, top, right - left, bottom - top);
    }

    let blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/png');
    if (!blob) throw new Error('이미지 인코딩에 실패했습니다.');

    return { blob, width, height, hash: await sha256Hex(blob) };
  } finally {
    bitmap.close();
  }
}

export function extensionForMime(mime: string): string {
  return mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
}

// Data URL -> Blob. 로컬 디코딩만 수행하며 네트워크 요청은 발생하지 않는다.
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('유효하지 않은 Data URL입니다.');
  const [, mime = 'application/octet-stream', isBase64, data] = match;
  if (!isBase64) return new Blob([decodeURIComponent(data)], { type: mime });
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
