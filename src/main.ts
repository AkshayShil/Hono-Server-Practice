import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

// Global error handler to help diagnose mobile white-screen issues
const logToServer = async (error: any, context: string) => {
  try {
    await fetch('/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context,
        message: error?.message || String(error),
        stack: error?.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('Failed to log error to server:', e);
  }
};

app.config.errorHandler = (err, vm, info) => {
  console.error('[Vue Error]:', err, info);
  logToServer(err, `Vue Error: ${info}`);
  
  const appEl = document.getElementById('app');
  if (appEl && appEl.innerHTML === '') {
    appEl.innerHTML = `
      <div style="padding: 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; margin: 20px; font-family: sans-serif;">
        <h3 style="margin-top: 0;">Startup Error</h3>
        <p style="font-size: 14px; word-break: break-all;">${err}</p>
        <p style="font-size: 12px; color: #856404;">Check console for details</p>
      </div>
    `;
  }
};

window.onerror = (msg, url, line, col, error) => {
  console.error('[Global Error]:', msg, url, line, col, error);
  logToServer(error || msg, `Global Error: ${url}:${line}:${col}`);

  const appEl = document.getElementById('app');
  if (appEl && appEl.innerHTML === '') {
    appEl.innerHTML = `<div style="padding: 20px; color: red;">Global Error: ${msg} at ${line}:${col}</div>`;
  }
  return false;
};

window.onunhandledrejection = (event) => {
  console.error('[Unhandled Rejection]:', event.reason);
  logToServer(event.reason, 'Unhandled Promise Rejection');
};

app.use(createPinia())
app.use(router)

app.mount('#app')
