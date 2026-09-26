import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// 배포 빌드에만 CSP를 넣는다(개발 서버는 HMR용 인라인 스크립트가 필요).
// 에디터는 외부 서버와 통신하지 않으므로 모든 리소스를 자기 출처로 제한한다.
const csp: Plugin = {
  name: 'walksim-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace(
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'" />`,
  ),
}

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로로 빌드해야 크롬 확장 페이지(chrome-extension://.../editor/)와 데스크톱 앱에서도 동작한다.
  base: './',
  plugins: [react(), csp],
})
