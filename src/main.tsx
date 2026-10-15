import { Buffer } from 'buffer'
if (!('Buffer' in globalThis)) (globalThis as unknown as Record<string, unknown>).Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './identity/identity.css'
import App from './App'
import { IdentityProvider } from './identity/IdentityProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IdentityProvider>
      <App />
    </IdentityProvider>
  </StrictMode>,
)
