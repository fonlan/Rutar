import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const ROOT_ELEMENT_ID = "root";

function ensureBootSplash() {
  if (document.getElementById('boot-splash')) {
    return;
  }

  const splashElement = document.createElement('div');
  splashElement.id = 'boot-splash';
  splashElement.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 9999',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'background: #0f172a',
    'color: #e2e8f0',
    'font-family: Segoe UI, Arial, sans-serif',
  ].join(';');
  splashElement.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;user-select:none"><div style="height:18px;width:18px;border-radius:9999px;border:2px solid rgba(148,163,184,0.55);border-top-color:#e2e8f0;animation:rutar-spin 0.85s linear infinite"></div><span style="font-size:12px;color:#94a3b8">Loading Rutar...</span></div>';

  if (!document.getElementById('boot-splash-spin-style')) {
    const spinStyle = document.createElement('style');
    spinStyle.id = 'boot-splash-spin-style';
    spinStyle.textContent = '@keyframes rutar-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(spinStyle);
  }

  document.body.appendChild(splashElement);
}

ensureBootSplash();

ReactDOM.createRoot(document.getElementById(ROOT_ELEMENT_ID) as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
