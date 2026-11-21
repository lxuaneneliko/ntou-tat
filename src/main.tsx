import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GooglePlayMigration } from './GooglePlayMigration'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <GooglePlayMigration />
  </StrictMode>,
)
