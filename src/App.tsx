import { useState } from 'react'
import { LandingPage } from './LandingPage'
import type { PanelLaunchSelection } from './LandingPage'
import PanelBuilder from './PanelBuilder'

export default function App() {
  const [selection, setSelection] = useState<PanelLaunchSelection | null>(null)
  const [workspaceId, setWorkspaceId] = useState(0)

  if (!selection) {
    return <LandingPage onStart={(nextSelection) => {
      setWorkspaceId((current) => current + 1)
      setSelection(nextSelection)
    }} />
  }

  return (
    <PanelBuilder
      key={workspaceId}
      initialCytometer={selection.cytometer}
      initialConfiguration={selection.configuration}
      onRequestExit={() => setSelection(null)}
    />
  )
}
