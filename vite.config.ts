import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

function localRuntimeConfig(): Plugin {
  return {
    name: 'pawapo-local-runtime-config',
    configureServer(server) {
      server.middlewares.use('/runtime-config.json', (_request, response) => {
        try {
          const outputs = JSON.parse(readFileSync('amplify_outputs.json', 'utf8'))
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify({
            auth: {
              region: outputs.auth.aws_region,
              userPoolId: outputs.auth.user_pool_id,
              userPoolClientId: outputs.auth.user_pool_client_id,
            },
            agent: {
              runtimeArn: outputs.custom.agentRuntimeArn,
              protocol: 'HTTP',
            },
            sharing: { baseUrl: `https://${outputs.custom.sharedSlidesPublicDomain}` },
            environment: outputs.custom.environment,
          }))
        } catch {
          response.statusCode = 503
          response.end('amplify_outputs.json is required for authenticated local development')
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
