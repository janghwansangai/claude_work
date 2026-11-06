// 영상 촬영 도구: Xvfb 화면을 ffmpeg로 고화질 녹화하고, xdotool로 진짜 마우스·키보드를 움직인다.
// 눌러야 할 버튼은 누르기 전에 화면 위 강조 링(페이지 안에 그리는 표시)으로 알려 준다.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DISPLAY = ':99';
const ENV = { ...process.env, DISPLAY };
const DIR = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const xdo = (...a) => execFileSync('xdotool', a.map(String), { env: ENV }).toString();

let rec = null;
function startCapture(name) {
  const out = path.join(DIR, 'raw', `${name}.mkv`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '30', '-video_size', '1920x1080', '-i', DISPLAY,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv444p', out], { env: ENV, stdio: ['pipe', 'inherit', 'inherit'] });
  rec = { p, out, t0: Date.now() + 150, marks: [], name };
  return rec;
}
const now = () => (Date.now() - rec.t0) / 1000;
function mark(id) { rec.marks.push({ id, t: now() }); console.log(`[${now().toFixed(1)}] mark ${id}`); }
async function stopCapture() {
  rec.marks.push({ id: 'end', t: now() });
  rec.p.stdin.write('q'); rec.p.stdin.end();
  await new Promise(r => rec.p.on('close', r));
  fs.writeFileSync(rec.out.replace(/\.mkv$/, '.marks.json'), JSON.stringify(rec.marks, null, 1));
  rec = null;
}

// 마우스: 현재 위치에서 목표까지 부드럽게(ease-in-out) 움직인다.
let cur = { x: 960, y: 560 };
async function moveTo(x, y, ms = 650) {
  x = Math.round(x); y = Math.round(y);
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...cur };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    xdo('mousemove', Math.round(from.x + (x - from.x) * e), Math.round(from.y + (y - from.y) * e));
    await sleep(ms / steps);
  }
  cur = { x, y };
}
async function click(x, y, { pause = 250 } = {}) { await moveTo(x, y); await sleep(pause); xdo('click', 1); await sleep(200); }
async function drag(x1, y1, x2, y2, ms = 700) {
  await moveTo(x1, y1); await sleep(200); xdo('mousedown', 1);
  await moveTo(x2, y2, ms); await sleep(150); xdo('mouseup', 1); await sleep(200);
}
const key = k => xdo('key', k);
async function type(text, delay = 110) { xdo('type', '--delay', delay, text); }

// 페이지 요소 → 화면 좌표(픽셀). 브라우저 창은 (0,0)에 있고 배율(dpr)이 적용된다.
async function boxOf(page, locator) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b) throw new Error('보이지 않는 요소: ' + locator);
  const m = await page.evaluate(() => ({ sx: screenX, sy: screenY, top: outerHeight - innerHeight, left: outerWidth - innerWidth, dpr: devicePixelRatio }));
  const ox = m.sx + m.left / 2, oy = m.sy + m.top;
  return { x: (ox + b.x) * m.dpr, y: (oy + b.y) * m.dpr, w: b.width * m.dpr, h: b.height * m.dpr, cx: (ox + b.x + b.width / 2) * m.dpr, cy: (oy + b.y + b.height / 2) * m.dpr };
}

// 강조 링: 페이지 안에 2초 동안 맥박처럼 뛰는 테두리를 그린다.
async function highlight(page, locator, ms = 1100) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b) return;
  await page.evaluate(({ b, ms }) => {
    if (!document.getElementById('__hl_style')) {
      const s = document.createElement('style'); s.id = '__hl_style';
      s.textContent = '@keyframes __hlp{0%{box-shadow:0 0 0 0 rgba(255,59,48,.55)}70%{box-shadow:0 0 0 14px rgba(255,59,48,0)}100%{box-shadow:0 0 0 0 rgba(255,59,48,0)}}';
      document.documentElement.appendChild(s);
    }
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'fixed', left: b.x - 6 + 'px', top: b.y - 6 + 'px', width: b.width + 12 + 'px', height: b.height + 12 + 'px',
      border: '3px solid #ff3b30', borderRadius: '10px', zIndex: 2147483647, pointerEvents: 'none', animation: '__hlp 0.9s ease-out infinite' });
    document.documentElement.appendChild(d);
    setTimeout(() => d.remove(), ms + 900);
  }, { b, ms });
  await sleep(ms);
}
async function clickEl(page, locator, { hl = true, pause = 200 } = {}) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const b = await boxOf(page, el);
  const hp = hl ? highlight(page, el, 1000) : Promise.resolve();
  await moveTo(b.cx, b.cy);
  await hp;
  await sleep(pause);
  xdo('click', 1);
  await sleep(250);
  return b;
}
// 화면 좌표 강조(확장 프로그램 팝업처럼 페이지 밖): 기록만 남기고 편집 때 그린다.
const overlays = [];
function screenHighlight(x, y, w, h, ms = 1100) { overlays.push({ name: rec?.name, t: now(), d: ms / 1000, x, y, w, h }); return sleep(ms); }
function saveOverlays() { fs.writeFileSync(path.join(DIR, 'raw', 'overlays.json'), JSON.stringify(overlays, null, 1)); }

module.exports = { DISPLAY, ENV, sleep, xdo, startCapture, stopCapture, mark, now, moveTo, click, drag, key, type, boxOf, highlight, clickEl, screenHighlight, saveOverlays, overlays, setCur: (x, y) => { cur = { x, y }; } };
