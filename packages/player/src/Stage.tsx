import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Rect } from '@walksim/shared';
import type { Box, Visible } from './layout';

const FULL: Rect = [0, 0, 1, 1];

// 캡처 이미지를 비율 그대로(contain) 배치하고, 같은 상자 위에 오버레이를 올린다.
// 이미지의 실제 크기(naturalWidth/Height)를 기준으로 계산하므로 캡처 해상도·DPR·창 크기가 달라도 핫스팟이 어긋나지 않는다.
// zoom이 있으면 그 영역이 화면에 꽉 차도록 이미지 상자를 키우고 옮긴다(Arcade의 Pan & Zoom).
// CSS transform 대신 상자 크기 자체를 바꾸므로 핫스팟·말풍선 좌표 계산이 그대로 유지된다.
export function Stage({ src, fallback, zoom, children }: {
  src: string;
  fallback: { width: number; height: number };
  zoom?: Rect;
  children: (box: Box, visible: Visible) => ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [container, setContainer] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState<{ src: string; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(([entry]) => setContainer({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const size = natural?.src === src ? natural : natural ?? fallback;
  const [zx, zy, zw, zh] = zoom ?? FULL;
  const regionW = size.width * zw;
  const regionH = size.height * zh;
  const scale = Math.min(container.width / regionW, container.height / regionH) || 0;
  const width = size.width * scale;
  const height = size.height * scale;
  const left = (container.width - regionW * scale) / 2 - zx * width;
  const top = (container.height - regionH * scale) / 2 - zy * height;
  const visible: Visible = { x: -left, y: -top, width: container.width, height: container.height };

  return (
    <main ref={ref} className="relative flex-1 min-h-0 bg-gray-800 overflow-hidden">
      <div className="absolute motion-safe:transition-all motion-safe:duration-500 ease-out" style={{ left, top, width, height }}>
        {src && failed !== src ? (
          <img
            key={`${src}#${retry}`}
            src={src}
            alt="실습 화면"
            draggable={false}
            onLoad={e => setNatural({ src, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            onError={() => setFailed(src)}
            className="absolute inset-0 w-full h-full select-none motion-safe:animate-fadein"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col gap-3 items-center justify-center bg-gray-700 text-gray-300 text-sm">
            {src ? '화면 이미지를 불러오지 못했습니다.' : '이 단계에는 화면 이미지가 없습니다.'}
            {src && <button onClick={() => { setFailed(null); setRetry(r => r + 1); }} className="px-3 py-1 rounded bg-white text-gray-900">다시 시도</button>}
          </div>
        )}
        {width > 0 && children({ width, height }, visible)}
      </div>
    </main>
  );
}
