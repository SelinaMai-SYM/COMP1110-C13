import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/*
- What it does:
  Mounts the React application into the browser DOM.
- Inputs:
  The root HTML element created by index.html.
- Outputs:
  A StrictMode-rendered dashboard application.
*/

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
