// 보조 창(영역 선택·화면 스트림·도구 막대) 전용. 허용된 채널만 주고받는다.
import { contextBridge, ipcRenderer } from 'electron';

const RECEIVE = new Set(['cap:start', 'cap:pin', 'cap:now', 'toolbar:state']);
const SEND = new Set(['ui:reply', 'toolbar:pause', 'toolbar:stop']);

contextBridge.exposeInMainWorld('walksimUI', {
  platform: process.platform,
  on(channel: string, cb: (...args: unknown[]) => void) {
    if (RECEIVE.has(channel)) ipcRenderer.on(channel, (_e, ...args) => cb(...args));
  },
  send(channel: string, ...args: unknown[]) {
    if (SEND.has(channel)) ipcRenderer.send(channel, ...args);
  },
  finishOverlay(region: unknown) {
    return ipcRenderer.invoke('overlay:done', region);
  },
});
