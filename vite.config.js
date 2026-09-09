import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Proxy /api và /socket.io sang backend — bắt buộc để cookie httpOnly hoạt động (SameSite=Lax
// không tự gửi cookie cross-origin). Không dùng cho production thật (Cloudflare Workers,
// xem client/worker/proxy.js, đã same-origin sẵn theo cách khác) — chỉ cho `vite dev` (server.proxy)
// và `vite preview` chạy trong docker-compose (preview.proxy). Target đổi được qua
// VITE_PROXY_TARGET (Docker cần trỏ tên service "server", ngoài Docker mặc định localhost).
const proxy = {
  '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
  '/socket.io': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', ws: true, changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: { proxy },
  preview: { proxy },
  build: {
    rollupOptions: {
      output: {
        // Tách vendor (node_modules) khỏi code app để cache trình duyệt tốt hơn qua các lần deploy.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
})
