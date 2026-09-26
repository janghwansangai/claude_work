// 녹화 영역 선택 화면. 결과는 이 창(=디스플레이) 기준 좌표로 메인 프로세스에 돌려준다.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sel = $('sel');
const card = $('card');
const actions = $('actions');
const ready = $<HTMLInputElement>('ready');
const go = $<HTMLButtonElement>('go');
const full = $<HTMLButtonElement>('full');

// 모니터가 여러 대면 각 모니터에 이 화면이 뜬다. 녹화할 모니터에서 드래그하면 된다.
const params = new URLSearchParams(location.search);
const total = Number(params.get('total') ?? '1');
if (total > 1) {
  const badge = $('badge');
  badge.hidden = false;
  badge.textContent = `모니터 ${params.get('monitor')} / ${total}`;
  const multi = $('multi');
  multi.hidden = false;
  multi.textContent = `모니터가 ${total}대입니다. 녹화할 프로그램이 있는 모니터 화면에서 영역을 드래그하거나 '전체 화면 녹화'를 누르세요.`;
  if (params.get('current') !== '1') card.style.top = '96px';
}

let start: { x: number; y: number } | null = null;
let region: { x: number; y: number; width: number; height: number } | null = null;

const sync = () => { go.disabled = !ready.checked || !region; full.disabled = !ready.checked; };
ready.addEventListener('change', sync);

function draw(r: { x: number; y: number; width: number; height: number }) {
  Object.assign(sel.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
}

document.addEventListener('mousedown', e => {
  if (card.contains(e.target as Node) || actions.contains(e.target as Node) || e.button !== 0) return;
  start = { x: e.clientX, y: e.clientY };
  region = null;
  actions.style.display = 'none';
  document.body.classList.add('selected');
  sync();
});
document.addEventListener('mousemove', e => {
  if (!start) return;
  draw({ x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) });
});
document.addEventListener('mouseup', e => {
  if (!start) return;
  const r = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) };
  start = null;
  if (r.width < 40 || r.height < 40) { sel.style.display = 'none'; document.body.classList.remove('selected'); return; }
  region = r;
  const below = r.y + r.height + 52 < window.innerHeight;
  Object.assign(actions.style, { display: 'flex', left: `${Math.max(8, r.x + r.width - 260)}px`, top: `${below ? r.y + r.height + 10 : Math.max(8, r.y - 46)}px` });
  sync();
});

$('redo').addEventListener('click', () => { region = null; sel.style.display = 'none'; actions.style.display = 'none'; document.body.classList.remove('selected'); sync(); });
go.addEventListener('click', () => { if (region && ready.checked) void walksimUI.finishOverlay(region); });
full.addEventListener('click', () => { if (ready.checked) void walksimUI.finishOverlay({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }); });
$('cancel').addEventListener('click', () => { void walksimUI.finishOverlay(null); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') void walksimUI.finishOverlay(null); });
