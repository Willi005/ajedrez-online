import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// The two faces of the Classical design system, self-hosted rather than pulled
// from the Google Fonts CDN the system's stylesheet links: the app is demoed on
// a LAN with no route to the internet, where that link would simply fail and
// take the whole look with it. Only the latin subset and only the weights the
// system actually uses — 400 and 600 — so the bundle carries four files.
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/lora/latin-400.css'
import '@fontsource/lora/latin-600.css'

import './index.css'
import './design-system.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
