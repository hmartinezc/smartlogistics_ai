import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// STRICT RELATIVE IMPORT: Must start with './'
import './index.css';
import './widget'; // Registrar el Web Component

// Solo montar automáticamente si existe el elemento root y NO estamos en modo librería pura
// Esto permite probar la app standalone si se quiere
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
