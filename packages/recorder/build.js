const esbuild = require('esbuild');
const fs = require('fs');
const { execSync } = require('child_process');

const withEditor = !process.argv.includes('--no-editor');

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist');
fs.cpSync('public', 'dist', { recursive: true });

const common = { bundle: true, minify: false, target: ['chrome116'], outdir: 'dist' };

Promise.all([
  // 서비스 워커는 모듈, 주입/팝업 스크립트는 일반 스크립트(IIFE)로 빌드한다.
  esbuild.build({ ...common, entryPoints: ['src/background.ts'], format: 'esm' }),
  esbuild.build({ ...common, entryPoints: ['src/content.ts', 'src/popup.ts', 'src/editor-bridge.ts'], format: 'iife' }),
]).then(() => {
  if (withEditor) {
    // 교사는 npm/localhost 없이 확장 프로그램만 설치하면 된다: 에디터를 확장 페이지로 함께 넣는다.
    execSync('npm run build -w @walksim/editor -- --outDir ../recorder/dist/editor --emptyOutDir', { stdio: 'inherit', cwd: '../..' });
  }
  console.log('Extension built! → packages/recorder/dist (chrome://extensions 에서 "압축해제된 확장 프로그램 로드")');
}).catch(err => { console.error(err); process.exit(1); });
