import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { Web3Provider } from './contexts/Web3Context.jsx'
import { ToastProvider } from './components/common/Toast.jsx'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Web3Provider>
          <App />
        </Web3Provider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
