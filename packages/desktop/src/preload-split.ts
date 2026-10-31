// 따라 하기 창의 위쪽 막대 전용. 허용된 채널만 주고받는다.
import { contextBridge, ipcRenderer } from 'electron';

const SEND = new Set(['split:go', 'split:back', 'split:forward', 'split:reload', 'split:external', 'split:guide']);

contextBridge.exposeInMainWorld('walksimSplit', {
  send(channel: string, ...args: unknown[]) {
    if (SEND.has(channel)) ipcRenderer.send(channel, ...args);
  },
  onState(cb: (state: unknown) => void) {
    ipcRenderer.on('split:state', (_e, state) => cb(state));
  },
});
