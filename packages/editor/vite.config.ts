import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로로 빌드해야 크롬 확장 페이지(chrome-extension://.../editor/)에서도 동작한다.
  base: './',
  plugins: [react()],
})
