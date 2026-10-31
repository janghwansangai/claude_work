// 따라 하기 창의 위쪽 막대: 왼쪽 안내(가이드)와 오른쪽 실제 사이트의 주소·이동 버튼.
interface SplitBridge {
  send: (channel: string, ...args: unknown[]) => void;
  onState: (cb: (state: { url: string; canBack: boolean; canForward: boolean; guideRatio: number }) => void) => void;
}
const bridge = (window as unknown as { walksimSplit: SplitBridge }).walksimSplit;
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const addr = byId<HTMLInputElement>('addr');
const err = byId('err');
const guideUrl = byId<HTMLInputElement>('guide-url');

const isWeb = (v: string) => { try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
const withScheme = (v: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);

addr.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const url = withScheme(addr.value);
  err.hidden = isWeb(url);
  if (isWeb(url)) bridge.send('split:go', url);
});
byId('back').addEventListener('click', () => bridge.send('split:back'));
byId('forward').addEventListener('click', () => bridge.send('split:forward'));
byId('reload').addEventListener('click', () => bridge.send('split:reload'));
byId('external').addEventListener('click', () => bridge.send('split:external'));
byId('guide-current').addEventListener('click', () => bridge.send('split:guide', null));
const openGuide = () => {
  const url = withScheme(guideUrl.value);
  if (guideUrl.value.trim() && url.startsWith('https://')) bridge.send('split:guide', url);
};
byId('guide-open').addEventListener('click', openGuide);
guideUrl.addEventListener('keydown', e => { if (e.key === 'Enter') openGuide(); });

bridge.onState(state => {
  if (document.activeElement !== addr) addr.value = state.url;
  (byId('back') as HTMLButtonElement).disabled = !state.canBack;
  (byId('forward') as HTMLButtonElement).disabled = !state.canForward;
  document.documentElement.style.setProperty('--guide', `${Math.round(state.guideRatio * 100)}%`);
});
export {};
