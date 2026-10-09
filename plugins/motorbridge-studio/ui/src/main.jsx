import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n';
import './styles/base.css';
import './styles/studio-shell.css';
import './styles/studio-motors.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Cordis host integration: unload React and its connections when the plugin stops.
if (import.meta.env.VITE_CORDIS_HOST === 'true') {
  const events = new window.EventSource('/api/studio/events');
  events.onmessage = (event) => {
    if (JSON.parse(event.data).enabled) return;
    events.close();
    root.unmount();
    document.getElementById('root').textContent = 'MotorBridge Studio 插件已停用。请在应用页面重新加载。';
    window.parent.postMessage({ type: 'motorbridge-studio:disabled' }, window.location.origin);
  };
  window.addEventListener('pagehide', () => events.close(), { once: true });
}
