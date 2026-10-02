import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Automatically register service worker for precaching assets and offline support
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New content is available; refreshing...');
  },
  onOfflineReady() {
    console.log('[PWA] App is ready to work offline.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

