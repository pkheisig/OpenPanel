import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { installStaleChunkRecovery } from './staleChunkRecovery.ts'
import App from './App.tsx'
import './index.css'

installStaleChunkRecovery()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
