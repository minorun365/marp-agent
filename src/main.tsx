import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import { I18n } from 'aws-amplify/utils'
import { translations } from '@aws-amplify/ui-react'
import './index.css'
import App from './App.tsx'

// モックモード時はAmplify設定をスキップ（ローカル開発用）
const useMock = import.meta.env.VITE_USE_MOCK === 'true'

async function initializeApp() {
  I18n.putVocabularies(translations)
  I18n.setLanguage('ja')

  if (!useMock) {
    // 本番モード: amplify_outputs.json を読み込んでAmplifyを設定
    const outputs = await import('../amplify_outputs.json')
    Amplify.configure(outputs.default)
  }

  // 設定完了後にレンダリング
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initializeApp()
