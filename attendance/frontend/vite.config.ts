import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const plugins: any[] = [react(), tailwindcss()];
if (!process.env.DISABLE_SSL) {
  plugins.push(basicSsl() as any);
}

export default defineConfig({
  plugins,
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:4001'
    }
  }
})
