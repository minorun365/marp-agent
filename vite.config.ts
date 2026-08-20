import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const LOCAL_RUNTIME_CONFIG = 'runtime-config.local.json'

// 本番では画面配信Lambdaが /runtime-config.json を返す。ローカルでは同じ形のファイルをそのまま返し、
// ブラウザから見た経路を本番とそろえる。
function localRuntimeConfig(): Plugin {
  return {
    name: 'pawapo-local-runtime-config',
    configureServer(server) {
      server.middlewares.use('/runtime-config.json', (_request, response) => {
        try {
          const config = JSON.parse(readFileSync(LOCAL_RUNTIME_CONFIG, 'utf8'))
          if (!config.auth?.userPoolId || !config.agent?.runtimeArn) {
            throw new Error('auth.userPoolId と agent.runtimeArn が必要です')
          }
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify(config))
        } catch (error) {
          response.statusCode = 503
          response.end(
            `${LOCAL_RUNTIME_CONFIG} を読めませんでした（認証つきのローカル開発に必要です）: ${String(error)}`,
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [localRuntimeConfig(), react(), tailwindcss()],
  server: {
    proxy: {
      '/local-agent': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-agent/, '/invocations'),
      },
    },
  },
})
