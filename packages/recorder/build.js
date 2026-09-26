const esbuild = require('esbuild');
const fs = require('fs');

if (!fs.existsSync('dist')) fs.mkdirSync('dist');
fs.cpSync('public', 'dist', { recursive: true });

esbuild.build({
  entryPoints: ['src/background.ts', 'src/content.ts', 'src/popup.ts', 'src/editor-bridge.ts'],
  outdir: 'dist',
  bundle: true,
  minify: false,
  format: 'esm',
  target: ['chrome110']
}).then(() => console.log('Extension built!'))
.catch(() => process.exit(1));
