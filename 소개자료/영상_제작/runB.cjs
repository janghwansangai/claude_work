// 촬영 B: 데스크톱 앱 — 화면 녹화 시작 버튼, ↔ 따라 하기 창
const R = require('./rig.cjs');
const { _electron: electron } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = '/home/user/claude_work';
const SPKI = fs.readFileSync(path.join(__dirname, 'spki.txt'), 'utf8').trim();
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wsv-'));
  const app = await electron.launch({
    executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', '--force-device-scale-factor=1.25', '--no-proxy-server', '--lang=ko',
      '--host-resolver-rules=MAP class.example 127.0.0.1:8443', `--ignore-certificate-errors-spki-list=${SPKI}`, path.join(ROOT, 'packages/desktop')],
    env: { ...process.env, DISPLAY: ':99', WALKSIM_USER_DATA: userData, LANGUAGE: 'ko' },
  });
  const ed = await app.firstWindow();
  await ed.waitForSelector('text=화면 녹화 시작', { timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 0, y: 0, width: 1536, height: 864 }); w.setMenuBarVisibility(true); });
  await R.sleep(800);
  // 예제 프로젝트를 미리 열어 둔다(촬영 전)
  await ed.getByRole('button', { name: /프로젝트/ }).first().click();
  await ed.getByRole('dialog').locator('input[type=file]').setInputFiles(path.join(__dirname, 'sample.walksim'));
  await ed.waitForFunction(() => !document.querySelector('button[title*="창 전체 크기"]')?.disabled, null, { timeout: 15000 });
  await ed.keyboard.press('Escape').catch(() => {});
  await R.sleep(1000);
  await R.moveTo(1100, 600, 10);
  R.startCapture('runB'); await R.sleep(600);
  R.mark('s12_desktop');
  await R.highlight(ed, ed.getByRole('button', { name: /화면 녹화 시작/ }), 1600);
  await R.sleep(1500);
  const fb = ed.getByRole('button', { name: '↔ 따라 하기' });
  const winP = app.waitForEvent('window');
  await R.clickEl(ed, fb);
  await winP; await R.sleep(500);
  const setSplit = wd => app.evaluate(({ BrowserWindow }, wd) => { const w = BrowserWindow.getAllWindows().find(x => x.getTitle().includes('따라 하기')); w.setBounds({ x: 0, y: 0, width: wd, height: 864 }); w.focus(); return w.getContentBounds(); }, wd);
  await setSplit(1530); await R.sleep(300); const cb = await setSplit(1536);
  await R.sleep(2000);
  const bar = app.windows().find(w => w.url().endsWith('split.html'));
  const addr = bar.locator('#addr');
  await R.clickEl(bar, addr); await R.type('class.example', 90); R.key('Return'); await R.sleep(2500);
  const guide = app.windows().find(w => w.url().includes('/player/'));
  if (guide) {
    const start = guide.getByRole('button', { name: /시작하기/ });
    // 안내 칸은 따라 하기 창 안의 보기(WebContentsView)라 좌표를 직접 계산한다
    const b = await start.boundingBox();
    const top = cb.y + 48; // 메뉴 막대 + 위쪽 막대 높이(DIP)
    await R.highlight(guide, start, 1000);
    await R.click((b.x + b.width / 2) * 1.25, (top + b.y + b.height / 2) * 1.25); await R.sleep(2000);
  }
  await R.sleep(3000);
  R.mark('end_b');
  await R.stopCapture();
  await app.close();
  console.log('done');
})().catch(async e => { console.error(e); try { await R.stopCapture(); } catch {} process.exit(1); });
