import { validateManifest, type Manifest } from '@walksim/shared';

// 미리보기: 같은 출처(확장 프로그램·데스크톱 앱)의 편집기 창에 지금 프로젝트를 요청한다.
// 편집기는 Manifest와 가림 처리된 이미지만 보낸다. 네트워크를 쓰지 않는다.
const CHANNEL = 'walksim-preview';
const TIMEOUT_MS = 4000;

export interface PreviewLesson {
  manifest: Manifest;
  resolve: (path: string | undefined) => string;
  revoke: () => void;
}

export function loadPreview(): Promise<PreviewLesson> {
  return new Promise((resolve, reject) => {
    if (typeof BroadcastChannel === 'undefined') { reject(new Error('이 브라우저에서는 미리보기를 쓸 수 없습니다.')); return; }
    const channel = new BroadcastChannel(CHANNEL);
    const timer = setTimeout(() => {
      channel.close();
      reject(new Error('편집기 창을 찾지 못했습니다. 실습 녹화기 편집기를 연 채로 다시 시도하세요.'));
    }, TIMEOUT_MS);
    channel.onmessage = (e: MessageEvent) => {
      if (e.data?.type !== 'lesson') return;
      clearTimeout(timer);
      channel.close();
      try {
        const manifest = validateManifest(e.data.manifest);
        const urls = new Map<string, string>();
        const files = (e.data.files ?? {}) as Record<string, unknown>;
        for (const [path, blob] of Object.entries(files)) {
          if (blob instanceof Blob && /^image\/(webp|png|jpeg)$/.test(blob.type)) urls.set(path, URL.createObjectURL(blob));
        }
        resolve({
          manifest,
          resolve: path => (path ? urls.get(path) ?? '' : ''),
          revoke: () => urls.forEach(u => URL.revokeObjectURL(u)),
        });
      } catch {
        reject(new Error('미리보기 데이터 형식이 올바르지 않습니다.'));
      }
    };
    channel.postMessage({ type: 'ready' });
  });
}
