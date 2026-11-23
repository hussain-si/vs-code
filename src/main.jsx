import React from 'react'
import ReactDOM from 'react-dom/client'
import '@vscode/codicons/dist/codicon.css'
import './styles/base.css'
import './styles/workbench.css'
import './styles/explorer.css'
import './styles/editor.css'
import './styles/overlays.css'
import './styles/auth.css'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
