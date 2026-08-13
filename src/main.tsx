import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import './index.css'
import App from './App.tsx'
import { setRuntimeConfig, type RuntimeConfig } from './runtimeConfig.ts'

// モックモード時はAmplify設定をスキップ（ローカル開発用）
const useMock = import.meta.env.VITE_USE_MOCK === 'true'

async function initializeApp() {
  if (!useMock) {
    const response = await fetch('/runtime-config.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`runtime-config.json: ${response.status}`)
    const runtimeConfig = await response.json() as RuntimeConfig
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: runtimeConfig.auth.userPoolId,
          userPoolClientId: runtimeConfig.auth.userPoolClientId,
          loginWith: runtimeConfig.auth.cognitoDomain ? {
            oauth: {
              domain: runtimeConfig.auth.cognitoDomain,
              scopes: ['openid', 'email', 'profile'],
              redirectSignIn: [`${window.location.origin}/`],
              redirectSignOut: [`${window.location.origin}/`],
              responseType: 'code',
            },
          } : undefined,
        },
      },
    })
    setRuntimeConfig(runtimeConfig)
  }

  // 設定完了後にレンダリング
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void initializeApp().catch((error) => {
  console.error('Application initialization failed', error)
  const root = document.getElementById('root')
  if (root) root.textContent = 'アプリの設定を読み込めませんでした。時間をおいて再読み込みしてください。'
})
