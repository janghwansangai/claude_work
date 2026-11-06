const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const n of ['intro', 'outro']) { await p.goto('file://' + __dirname + '/' + n + '.html'); await p.waitForTimeout(500); await p.screenshot({ path: __dirname + '/' + n + '.png' }); }
  await b.close(); })();
