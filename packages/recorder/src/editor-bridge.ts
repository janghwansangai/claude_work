// 개발용: `npm run dev:editor`로 띄운 localhost 에디터에 캡처를 전달한다.
// 교사용 기본 경로는 확장 프로그램에 포함된 에디터 페이지이며, 이 브릿지를 거치지 않는다.
// walksim-editor 표시가 있는 페이지에서만 동작하고, 같은 출처로만 postMessage 한다.
if (document.querySelector('meta[name="walksim-editor"]')) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || request?.action !== 'NEW_CAPTURE') return;
    window.postMessage({ type: 'WALKSIM_NEW_CAPTURE', payload: request.payload }, location.origin);
    sendResponse({ received: true });
  });

  const announce = () => chrome.runtime.sendMessage({ action: 'EDITOR_READY' }).catch(() => {});
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.type === 'WALKSIM_EDITOR_READY') announce();
  });
  announce();
}
