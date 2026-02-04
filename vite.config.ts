
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // 映射 process.env 到 window.process.env，以便读取 index.html 中的配置
    'process.env': 'window.process.env'
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
  }
});
