import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ChakraProvider } from '@chakra-ui/react';
import logger from './utils/helpers/logger.js';
import { detectRefreshRate } from './utils/helpers/animation.js';

// DISABLE Service Worker in development to prevent HMR WebSocket interference
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().then(() => {
        logger.info('❌ Service Worker unregistered (dev mode)');
      }).catch((err) => {
        logger.error({ err }, 'Failed to unregister SW');
      });
    });
  }).catch(() => {});
  
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
      });
    });
  }
}

// Detect refresh rate on startup
console.log('🚀 Waluna initializing...');
detectRefreshRate().then((fps) => {
  logger.info(`📺 Display refresh rate detected: ${fps}Hz`);
  console.log(`✅ Waluna ready! Running at ${fps}Hz`);
}).catch((err) => {
  logger.error('Failed to detect refresh rate:', err);
  console.warn('⚠️  Refresh rate detection failed, using default 60Hz');
});

// re-detect when window regains focus or tab becomes visible (user possibly switched displays)
const debouncedDetect = (() => {
  let t = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      detectRefreshRate().catch(() => {});
      t = null;
    }, 300);
  };
})();

window.addEventListener('focus', debouncedDetect, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) debouncedDetect();
}, { passive: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <ChakraProvider>
    <App />
  </ChakraProvider>
);