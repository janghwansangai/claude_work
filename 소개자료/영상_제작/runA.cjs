// 촬영 A: 크롬 확장으로 실습 만들기 전체 흐름 (소개 사이트 → 녹화 → 검수 → 편집 → 미리보기 → 안전 확인·ZIP → 학생 화면)
const R = require('./rig.cjs');
const { launch } = require('./browser.cjs');
const fs = require('fs'), path = require('path');
const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));

// 장면별 예상 낭독 시간(초): 한국어 낭독 약 6.3음절/초 + 문장 사이 쉼
const est = {};
for (const s of script.scenes) est[s.id] = s.lines.reduce((a, l) => a + l.replace(/[\s.,·‘’'!?]/g, '').length / 6.3 + 0.45, 0) + 0.6;
let sceneStart = 0, sceneId = null;
async function scene(id) {
  if (sceneId) { const left = est[sceneId] - (R.now() - sceneStart); if (left > 0) await R.sleep(left * 1000); }
  if (id) { R.mark(id); sceneStart = R.now(); sceneId = id; }
}
const ICON = [1734, 79];

(async () => {
  const dl = path.join(__dirname, 'downloads'); fs.mkdirSync(dl, { recursive: true });
  const ctx = await R.sleep(0).then(() => launch({ dl }));
  const site = ctx.pages()[0];
  let editor = null;
  ctx.on('page', p => { if (p.url().includes('/editor/')) editor = p; });

  // 준비: 소개 사이트를 연 상태에서 촬영 시작
  await site.goto('https://claude-work.janhan97.workers.dev/');
  await site.waitForLoadState('networkidle').catch(() => {});
  await site.evaluate(() => document.activeElement && document.activeElement.blur());
  await R.moveTo(1890, 1060, 10); R.xdo('click', 1); await R.sleep(300); await site.evaluate(() => scrollTo(0, 0)); await R.sleep(300); await R.moveTo(1180, 640, 10); await R.sleep(1200);
  R.startCapture('runA'); await R.sleep(800);

  // s02 소개 사이트에서 받기
  await scene('s02_download');
  await R.sleep(1500);
  await site.evaluate(() => document.querySelector('#download')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await R.sleep(2200);
  for (const id of ['#dl-win', '#dl-mac-arm']) { await R.highlight(site, id, 1300); }
  const ext = site.locator('a[href*="Chrome-Extension"], a:has-text("크롬")').first();
  if (await ext.count()) await R.highlight(site, ext, 1500);

  // s03 녹화 시작
  await scene('s03_start');
  await site.goto('https://class.example/'); await R.sleep(1800);
  await R.screenHighlight(1712, 57, 44, 44, 900);
  await R.click(...ICON); await R.sleep(1100);
  await R.screenHighlight(1390, 250, 350, 26, 900);
  await R.click(1402, 263); await R.sleep(700);
  await R.screenHighlight(1390, 285, 350, 44, 900);
  await R.click(1565, 307); await R.sleep(1800);
  await site.bringToFront(); await R.sleep(300);

  // s04 평소처럼 조작
  await scene('s04_record');
  await R.clickEl(site, '#join'); await R.sleep(1300);
  await R.clickEl(site, '#name'); await site.keyboard.type('김하늘', { delay: 170 }); await R.sleep(400);
  await R.clickEl(site, '#uid'); await R.type('haneul12'); await R.sleep(300);
  await R.clickEl(site, '#pw'); await R.type('practice1234', 90); await R.sleep(300);
  await R.clickEl(site, '#agree'); await R.sleep(300);
  await R.clickEl(site, '#submit'); await R.sleep(1600);

  // s05 녹화 중지 → 에디터 열기
  await scene('s05_stop');
  await R.screenHighlight(1712, 57, 44, 44, 700);
  await R.click(...ICON); await R.sleep(1000);
  await R.screenHighlight(1390, 162, 350, 42, 800);
  await R.click(1564, 182); await R.sleep(900);
  await R.click(...ICON); await R.sleep(1000);
  await R.screenHighlight(1390, 218, 350, 38, 800);
  await R.click(1564, 236); await R.sleep(1500);
  const ed = editor || ctx.pages().find(p => p.url().includes('/editor/'));
  await ed.bringToFront(); await R.sleep(800);
  ed.on('dialog', d => setTimeout(() => d.accept().catch(() => {}), 900));

  // s06 검수함: 자동 가림 확인 → 직접 가리기 → 모두 선택 → 승인
  await scene('s06_inbox');
  const items = ed.locator('[role=option]');
  await R.clickEl(ed, items.nth(1), { hl: false }); await R.sleep(1400);
  await R.clickEl(ed, items.nth(2)); await R.sleep(1600);
  // 학교·반 이름(누리집 로고)을 직접 가림 상자로 덮는다
  const img = ed.locator('main img').first();
  const ib = await R.boxOf(ed, img);
  const nameRect = JSON.parse(fs.readFileSync(path.join(__dirname, 'logo-rect.json'), 'utf8')); // 사이트 화면 기준 비율
  const sx = ib.x + ib.w * nameRect.x, sy = ib.y + ib.h * nameRect.y, ex = sx + ib.w * nameRect.w, ey = sy + ib.h * nameRect.h;
  await R.clickEl(ed, ed.getByRole('button', { name: '가림 상자 그리기' })); await R.sleep(300);
  await R.drag(sx - 4, sy - 4, ex + 4, ey + 4, 900); await R.sleep(1200);
  await R.moveTo(ib.x + ib.w * 0.5, ib.y - 60, 500);
  await ed.keyboard.press('Control+a'); await R.sleep(1200);
  await R.clickEl(ed, ed.getByRole('button', { name: /선택 승인/ })); await R.sleep(2200);

  // s07 단계 편집: 제목·지시문 고치기, 강조 그리기
  await scene('s07_step');
  const steps = ed.locator('aside li, aside [role=button]').filter({ hasText: '회원가입 하기' });
  const first = (await steps.count()) ? steps.first() : ed.getByText("'회원가입 하기'", { exact: false }).first();
  await R.clickEl(ed, first); await R.sleep(1200);
  const ta = ed.locator('textarea').first();
  await R.clickEl(ed, ta); await ed.keyboard.press('Control+a'); await R.sleep(200);
  await ed.keyboard.type('‘회원가입 하기’ 버튼을 눌러 보세요.', { delay: 70 }); await R.sleep(700);
  await R.clickEl(ed, ed.getByRole('button', { name: '화살표' })); await R.sleep(300);
  const ib2 = await R.boxOf(ed, ed.locator('main img').first());
  const jb = JSON.parse(fs.readFileSync(path.join(__dirname, 'join-rect.json'), 'utf8'));
  const tx = ib2.x + ib2.w * (jb.x + jb.w), ty = ib2.y + ib2.h * (jb.y + jb.h / 2);
  await R.drag(tx + ib2.w * 0.16, ty + ib2.h * 0.10, tx + 10, ty + 4, 800); await R.sleep(900);
  // 프로젝트 제목
  const title = ed.getByLabel('프로젝트 제목');
  await R.clickEl(ed, title, { hl: false }); await ed.keyboard.press('Control+a');
  await ed.keyboard.type('학급 누리집 회원가입 연습', { delay: 60 }); await ed.keyboard.press('Tab'); await R.sleep(800);

  // s08 미리보기
  await scene('s08_preview');
  const pvBtn = ed.getByRole('button', { name: '▶ 미리보기' });
  const pvPromise = ctx.waitForEvent('page');
  await R.clickEl(ed, pvBtn);
  const pv = await pvPromise; await pv.waitForLoadState(); await R.sleep(1800);
  await R.clickEl(pv, pv.getByRole('button', { name: /시작하기/ })); await R.sleep(2200);
  const target = pv.locator('[aria-label$="(클릭)"]').first();
  await R.clickEl(pv, target, { hl: false }); await R.sleep(1600);

  // s09 안전 확인 → ZIP 내보내기
  await scene('s09_export');
  await ed.bringToFront(); await R.sleep(700);
  await R.clickEl(ed, ed.getByRole('button', { name: /안전 확인/ })); await R.sleep(1600);
  await R.clickEl(ed, ed.locator('input[type=checkbox]').last()); await R.sleep(600);
  const dlBtn = ed.getByRole('button', { name: /학생용 ZIP/ });
  const dlPromise = ed.waitForEvent('download').catch(() => null);
  await R.clickEl(ed, dlBtn); await R.sleep(2200);
  const d = await dlPromise; if (d) await d.saveAs(path.join(dl, 'student.zip')).catch(() => {});

  // s10 배포 안내(편집기 안의 ‘학생에게 나눠 주는 방법’)
  await scene('s10_deploy');
  const guide = ed.locator('summary', { hasText: '받은 ZIP으로 학생에게 나눠 주는 방법' }).first();
  console.log('guide open before', await guide.evaluate(s => s.parentElement.open));
  if (!(await guide.evaluate(s => s.parentElement.open))) await R.clickEl(ed, guide);
  await R.sleep(800); console.log('guide open after', await guide.evaluate(s => s.parentElement.open));
  await guide.evaluate(s => s.scrollIntoView({ behavior: 'smooth', block: 'start' })); await R.sleep(1200);
  await R.moveTo(1150, 700, 500);
  for (let i = 0; i < 6; i++) { R.xdo('click', 5); await R.sleep(350); }
  await R.sleep(1500);

  // s11 학생 화면(소개 사이트의 체험 실습)
  await scene('s11_student');
  await site.bringToFront();
  await site.goto('https://claude-work.janhan97.workers.dev/demo/'); await site.waitForLoadState('networkidle').catch(() => {}); await R.sleep(1500);
  const practice = site.getByText('연습 모드').first();
  await R.clickEl(site, practice); await R.sleep(800);
  await R.clickEl(site, site.getByRole('button', { name: /시작하기/ })); await R.sleep(2000);
  const t2 = site.locator('[aria-label$="(클릭)"]').first();
  if (await t2.count()) { await R.clickEl(site, t2, { hl: false }); await R.sleep(1500); }
  await scene(null);
  await R.sleep(1000);

  await R.stopCapture();
  R.saveOverlays();
  await ctx.close();
  console.log('done');
})().catch(async e => { console.error(e); try { await R.stopCapture(); R.saveOverlays(); } catch {} process.exit(1); });
