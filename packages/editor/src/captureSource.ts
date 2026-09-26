import { useEffect, useState } from 'react';

// 캡처 수신 경로
//  0) WalkSim 데스크톱 앱(Windows·macOS): preload가 노출한 window.walksimDesktop
//  1) 확장 프로그램 안의 에디터 페이지(chrome-extension://…/editor/): chrome.runtime 메시지. 교사용 기본 경로.
//     원본 캡처가 일반 웹페이지 컨텍스트를 거치지 않는다.
//  2) 개발용 localhost 에디터: 레코더의 editor-bridge 콘텐츠 스크립트가 window.postMessage로 전달.
export const isExtensionPage = typeof chrome !== 'undefined' && !!chrome.runtime?.id && location.protocol === 'chrome-extension:';

export interface DesktopBridge {
  platform: string;
  ready: () => void;
  onCapture: (cb: (payload: unknown) => void) => () => void;
  onState: (cb: (state: unknown) => void) => () => void;
  startRecording: () => Promise<{ ok: boolean; error?: string }>;
  stopRecording: () => Promise<void>;
}

export const desktop: DesktopBridge | undefined = (window as unknown as { walksimDesktop?: DesktopBridge }).walksimDesktop;

export type CaptureHandler = (payload: unknown) => void;

export function subscribeToCaptures(onCapture: CaptureHandler): () => void {
  if (desktop) {
    const off = desktop.onCapture(onCapture);
    desktop.ready(); // 에디터가 준비되기 전에 쌓인 캡처를 보내도록 알린다
    return off;
  }
  if (isExtensionPage) {
    const listener = (msg: { action?: string; payload?: unknown }, sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => {
      if (sender.id !== chrome.runtime.id || msg?.action !== 'NEW_CAPTURE') return;
      onCapture(msg.payload);
      sendResponse({ received: true });
    };
    chrome.runtime.onMessage.addListener(listener);
    // 에디터가 열리기 전에 쌓인 캡처를 백그라운드가 보내도록 알린다.
    chrome.runtime.sendMessage({ action: 'EDITOR_READY' }).catch(() => {});
    return () => chrome.runtime.onMessage.removeListener(listener);
  }

  const onMessage = (event: MessageEvent) => {
    // editor-bridge는 같은 창·같은 출처로 postMessage 한다. 다른 창/iframe에서 온 메시지는 무시.
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type !== 'WALKSIM_NEW_CAPTURE') return;
    onCapture(event.data.payload);
  };
  window.addEventListener('message', onMessage);
  window.postMessage({ type: 'WALKSIM_EDITOR_READY' }, window.location.origin);
  return () => window.removeEventListener('message', onMessage);
}

// 같은 에디터를 여러 탭에서 열면 서로의 저장을 덮어쓴다. Web Locks로 한 탭만 편집·수신하게 한다.
export function useEditorLock(): 'pending' | 'owner' | 'blocked' {
  const [state, setState] = useState<'pending' | 'owner' | 'blocked'>(navigator.locks ? 'pending' : 'owner');
  useEffect(() => {
    if (!navigator.locks) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const tryAcquire = (ifAvailable: boolean) =>
      navigator.locks.request('walksim-editor', ifAvailable ? { ifAvailable: true } : { signal: controller.signal }, lock => {
        if (controller.signal.aborted) return; // 언마운트 후 늦게 받은 잠금은 즉시 반납
        if (!lock) {
          setState('blocked');
          // 다른 탭이 닫히면 자동으로 이어받는다.
          tryAcquire(false).catch(() => {});
          return;
        }
        setState('owner');
        return new Promise<void>(resolve => { release = resolve; });
      });
    tryAcquire(true).catch(() => {});
    return () => { controller.abort(); release?.(); };
  }, []);
  return state;
}
