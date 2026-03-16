import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// STRICT RELATIVE IMPORT: Must start with './' to avoid "Failed to resolve module specifier"
import styles from './index.css?inline'; 

class SmartLogisticsWidget extends HTMLElement {
  private root: ReactDOM.Root | null = null;
  private mountPoint: HTMLDivElement;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.mountPoint = document.createElement('div');
    this.mountPoint.style.width = '100%';
    this.mountPoint.style.height = '100%';
    this.mountPoint.id = "smart-logistics-root";
  }

  connectedCallback() {
    if (this.shadowRoot && !this.root) {
      // 1. Inyectar Estilos
      const styleTag = document.createElement('style');
      styleTag.textContent = styles;
      this.shadowRoot.appendChild(styleTag);

      // 2. CSS Externo (opcional)
      const cssSrc = this.getAttribute('css-src');
      if (cssSrc) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssSrc;
        this.shadowRoot.appendChild(link);
      }

      // 3. Montar React
      this.shadowRoot.appendChild(this.mountPoint);
      this.style.display = 'none';
      this.render(false); 
    }
  }

  public open() {
    this.style.display = 'block';
    this.style.position = 'fixed';
    this.style.zIndex = '9999';
    this.style.inset = '0';
    this.render(true);
  }

  public close() {
    this.style.display = 'none';
    this.render(false);
  }

  private render(isOpen: boolean) {
    if (!this.root) {
      this.root = ReactDOM.createRoot(this.mountPoint);
    }
    
    this.root.render(
      <React.StrictMode>
        <App 
            isWidgetMode={true} 
            isOpen={isOpen} 
            onClose={() => this.close()} 
        />
      </React.StrictMode>
    );
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

if (!customElements.get('smart-logistics-widget')) {
  customElements.define('smart-logistics-widget', SmartLogisticsWidget);
}