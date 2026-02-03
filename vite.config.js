import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/basketball-stat/',
  build: {
    chunkSizeWarningLimit: 600, // 调整大小警告限制到600kb
    assetsDir: 'assets', // 指定资源目录名称
    rollupOptions: {
      output: {
        // 每次构建生成带哈希的文件名，防止浏览器缓存旧版本
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
})
