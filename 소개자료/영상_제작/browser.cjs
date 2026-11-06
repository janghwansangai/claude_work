const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const EXT = '/home/user/claude_work/packages/recorder/dist';
const SPKI = fs.readFileSync(path.join(__dirname, 'spki.txt'), 'utf8').trim();
async function launch({ app = null, fresh = true, dl } = {}) {
  const prof = path.join(__dirname, 'profile-run');
  if (fresh) { fs.rmSync(prof, { recursive: true, force: true }); fs.cpSync(path.join(__dirname, 'profile-template'), prof, { recursive: true }); }
  const args = [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--window-position=0,0', '--window-size=1536,864', '--force-device-scale-factor=1.25',
    '--lang=ko', '--no-first-run', '--hide-crash-restore-bubble', '--disable-features=Translate,HttpsUpgrades,DownloadBubble,DownloadBubbleV2',
    '--host-resolver-rules=MAP class.example 127.0.0.1:8443, MAP claude-work.janhan97.workers.dev 127.0.0.1:8444',
    `--ignore-certificate-errors-spki-list=${SPKI}`, '--disable-session-crashed-bubble', '--test-type', '--no-proxy-server'];
  if (app) args.push(`--app=${app}`);
  const ctx = await chromium.launchPersistentContext(prof, { headless: false, viewport: null, args, ignoreDefaultArgs: ['--enable-automation'],
    env: { ...process.env, DISPLAY: ':99', LANGUAGE: 'ko', LANG: 'ko_KR.UTF-8' }, locale: 'ko-KR', acceptDownloads: false });
  return ctx;
}
module.exports = { launch };
