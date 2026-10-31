import { useEffect, useRef } from 'react';
import type { Manifest } from '@walksim/shared';
import { desktop, isExtensionPage } from './captureSource';

// 미리보기·따라 하기: 같은 출처(확장 프로그램 또는 데스크톱 앱) 안의 학생 플레이어가
// BroadcastChannel로 "지금 프로젝트"를 요청하면 Manifest와 승인된(가림 처리된) 이미지만 보낸다.
// 검수 전 원본은 보내지 않는다. 네트워크를 거치지 않는다.
export const PREVIEW_CHANNEL = 'walksim-preview';

interface DesktopSplit { openSplit?: () => Promise<void> }
const desktopSplit = desktop as (typeof desktop & DesktopSplit) | undefined;

export const previewAvailable = isExtensionPage || !!desktopSplit?.openSplit;

export function openPreview() {
  if (desktopSplit?.openSplit) { void desktopSplit.openSplit(); return; }
  window.open(new URL('../player/index.html?preview=1', location.href).href, '_blank', 'noopener');
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
