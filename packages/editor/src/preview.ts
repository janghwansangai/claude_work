import { useEffect, useRef } from 'react';
import type { Manifest } from '@walksim/shared';
import { desktop, isExtensionPage } from './captureSource';

// 미리보기·따라 하기: 같은 출처(확장 프로그램 또는 데스크톱 앱) 안의 학생 플레이어가
// BroadcastChannel로 "지금 프로젝트"를 요청하면 Manifest와 승인된(가림 처리된) 이미지만 보낸다.
// 검수 전 원본은 보내지 않는다. 네트워크를 거치지 않는다.
export const PREVIEW_CHANNEL = 'walksim-preview';

interface DesktopPreview { openSplit?: () => Promise<void>; openPreview?: () => Promise<void> }
const desktopPreview = desktop as (typeof desktop & DesktopPreview) | undefined;

export const previewAvailable = isExtensionPage || !!desktopPreview?.openSplit;

/**
 * 'preview': 학생 화면만 크게 연다.
 * 'follow' : 따라 하기 — 왼쪽 학생 화면 + 오른쪽 실제 사이트(데스크톱 앱은 전용 창, 크롬 확장은 학생 화면의 나란히 보기).
 */
export function openPreview(kind: 'preview' | 'follow' = 'preview') {
  if (desktopPreview?.openSplit) {
    if (kind === 'preview' && desktopPreview.openPreview) void desktopPreview.openPreview();
    else void desktopPreview.openSplit();
    return;
  }
  const query = kind === 'follow' ? '?preview=1&split=1' : '?preview=1';
  window.open(new URL(`../player/index.html${query}`, location.href).href, '_blank', 'noopener');
}

export function usePreviewServer(manifest: Manifest, getImage: (assetId: string) => Blob | undefined) {
  const latest = useRef({ manifest, getImage });
  latest.current = { manifest, getImage };

  useEffect(() => {
    if (!previewAvailable || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL);
    channel.onmessage = (e: MessageEvent) => {
      if (e.data?.type !== 'ready') return;
      const { manifest, getImage } = latest.current;
      const files: Record<string, Blob> = {};
      for (const step of manifest.steps) {
        const path = manifest.assets[step.assetId];
        const blob = getImage(step.assetId);
        if (path && blob) files[path] = blob;
      }
      channel.postMessage({ type: 'lesson', manifest, files });
    };
    return () => channel.close();
  }, []);
}
