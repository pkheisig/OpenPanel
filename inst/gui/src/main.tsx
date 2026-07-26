import { StrictMode } from 'react'
import axios from 'axios'
import { createRoot } from 'react-dom/client'
import { removeApiTokenFromLocation, resolveApiToken } from './apiBase.ts'
import { installStaleChunkRecovery } from './staleChunkRecovery.ts'
import PanelBuilder from './PanelBuilder.tsx'
import './index.css'

installStaleChunkRecovery()

const apiToken = resolveApiToken()
if (apiToken) axios.defaults.headers.common['X-Spectreasy-Token'] = apiToken
removeApiTokenFromLocation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelBuilder />
  </StrictMode>,
)
