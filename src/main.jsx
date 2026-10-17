import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { actions } from './lib/store'

// Ссылка ?demo=1 сразу заполняет демо-данные (удобно для показа и проверки печати).
if (new URLSearchParams(location.search).get('demo') === '1') actions.loadDemo()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
