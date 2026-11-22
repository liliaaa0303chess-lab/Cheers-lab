import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import App from './App.tsx';
import './index.css';

// Prevent unhandled async rejections or SW errors from crashing mobile WebViews
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (ev) => {
    console.warn('Async warning:', ev.reason);
    ev.preventDefault();
  });
}

try {
  registerSW({
    immediate: true,
    onRegisterError(err) {
      console.warn('PWA registration skipped:', err);
    },
  });
} catch (err) {
  console.warn('PWA registration unavailable:', err);
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
