// 녹화 도구 막대. 이 창은 화면 캡처에서 제외된다(setContentProtection).
const bar = document.getElementById('bar')!;
const label = document.getElementById('label')!;
const pause = document.getElementById('pause')!;
const mod = walksimUI.platform === 'darwin' ? '⌘' : 'Ctrl';
document.getElementById('hint')!.textContent = `${mod}+Shift+F8 일시정지 · F9 중지`;

walksimUI.on('toolbar:state', (s: { recording: boolean; paused: boolean; count: number }) => {
  bar.classList.toggle('paused', s.paused);
  label.textContent = `${s.paused ? '일시정지' : '녹화 중'} · ${s.count}개`;
  pause.textContent = s.paused ? '계속' : '일시정지';
});
pause.addEventListener('click', () => walksimUI.send('toolbar:pause'));
document.getElementById('stop')!.addEventListener('click', () => walksimUI.send('toolbar:stop'));
