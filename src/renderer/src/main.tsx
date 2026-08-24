import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './lib/store'
import { App } from './App'
import { aplicarTemaGuardado } from './lib/tema'
import './styles.css'

// Antes de montar nada: si no, el primer fotograma sale en claro y da un fogonazo.
aplicarTemaGuardado()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
)

