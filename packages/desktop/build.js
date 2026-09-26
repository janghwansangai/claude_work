const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testsOnly = process.argv.includes('--tests-only');
const skipApp = process.argv.includes('--no-app');

async function buildTests() {
  fs.rmSync('dist-test', { recursive: true, force: true });
  const entries = fs.readdirSync('test').filter(f => f.endsWith('.test.ts')).map(f => `test/${f}`);
  await esbuild.build({ entryPoints: entries, outdir: 'dist-test', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, target: 'node20' });
}

// 배포 패키지에 들어갈 플레이어 파일 목록(에디터의 ZIP 내보내기가 사용). 개발용 샘플 실습은 제외한다.
function writePlayerFileList(dir) {
  const files = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(p); else files.push(p);
    }
  };
  walk('');
  const shipped = files.filter(f => !f.startsWith('play/') && !f.startsWith('assets/dummy-') && f !== 'files.json');
  fs.writeFileSync(path.join(dir, 'files.json'), JSON.stringify(shipped, null, 1));
}

async function buildApp() {
  // --no-app: 코드만 다시 빌드하고 이미 들어 있는 에디터·플레이어(dist/app)는 그대로 둔다.
  if (skipApp) {
    for (const f of fs.existsSync('dist') ? fs.readdirSync('dist') : []) if (f !== 'app') fs.rmSync(`dist/${f}`, { recursive: true, force: true });
  } else {
    fs.rmSync('dist', { recursive: true, force: true });
  }
  fs.mkdirSync('dist/ui', { recursive: true });
  const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'uiohook-napi'] };
  await Promise.all([
    esbuild.build({ ...node, entryPoints: ['src/main.ts'], outfile: 'dist/main.js' }),
    esbuild.build({ ...node, entryPoints: ['src/preload-editor.ts', 'src/preload-ui.ts'], outdir: 'dist' }),
    esbuild.build({ bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', entryPoints: ['src/ui/capture.ts', 'src/ui/overlay.ts', 'src/ui/toolbar.ts'], outdir: 'dist/ui' }),
  ]);
  for (const f of fs.readdirSync('src/ui').filter(f => f.endsWith('.html'))) fs.copyFileSync(`src/ui/${f}`, `dist/ui/${f}`);
  if (!skipApp) {
    // 교사용 에디터와 학생용 플레이어(ZIP 내보내기용)를 앱 안에 함께 넣는다.
    execSync('npm run build -w @walksim/editor -- --outDir ../desktop/dist/app/editor --emptyOutDir', { stdio: 'inherit', cwd: '../..' });
    execSync('npm run build -w @walksim/player -- --outDir ../desktop/dist/app/player --emptyOutDir', { stdio: 'inherit', cwd: '../..' });
    writePlayerFileList('dist/app/player');
  }
}

(testsOnly ? buildTests() : buildApp())
  .then(() => console.log(testsOnly ? 'tests built' : 'WalkSim desktop built → packages/desktop/dist'))
  .catch(err => { console.error(err); process.exit(1); });
