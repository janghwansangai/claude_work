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
});
