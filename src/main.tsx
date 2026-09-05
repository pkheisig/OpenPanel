import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { installStaleChunkRecovery } from './staleChunkRecovery.ts'
import { OpenPanelApplication } from './module/OpenPanelApplication'
import { createDefaultOpenPanelHostServices } from './standalone/standaloneHost'
import './index.css'
import './standalone/standalone.css'

installStaleChunkRecovery()
registerSW({ immediate: true })

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <OpenPanelApplication
      services={createDefaultOpenPanelHostServices()}
      applicationContext={{ mode: 'standalone' }}
    />
  </StrictMode>,
)

window.addEventListener('pagehide', () => root.unmount(), { once: true })
