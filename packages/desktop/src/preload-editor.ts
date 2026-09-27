// 에디터 페이지에 노출하는 최소한의 API. 원본 캡처는 이 통로로만 에디터 검수함(메모리)에 들어간다.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const subscribe = (channel: string) => (cb: (payload: unknown) => void) => {
  const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
};

contextBridge.exposeInMainWorld('walksimDesktop', {
  platform: process.platform,
  ready: () => ipcRenderer.send('editor:ready'),
  onCapture: subscribe('rec:capture'),
  onState: subscribe('rec:state'),
  startRecording: () => ipcRenderer.invoke('rec:start'),
  stopRecording: () => ipcRenderer.invoke('rec:stop'),
  // 검수 전 캡처 임시 보관용 암호화 키를 운영체제 보안 저장소(DPAPI/키체인)로 감싼다.
  secure: {
    protect: (plain: string) => ipcRenderer.invoke('secure:protect', plain),
    unprotect: (wrapped: string) => ipcRenderer.invoke('secure:unprotect', wrapped),
  },
});
