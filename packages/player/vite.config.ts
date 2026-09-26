import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로 빌드: Cloudflare Pages 하위 경로·학교 내부 웹서버 어디에 올려도 동작한다.
  base: './',
  plugins: [react()],
})
