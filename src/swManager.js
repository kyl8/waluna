// ONLY register Service Worker in production, NOT in development
if (import.meta.env.PROD) {
  // Register service worker for production only
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('SW registered:', registration.scope);
      }).catch((error) => {
        console.error('SW registration failed:', error);
      });
    });
  }
} else {
  // In development, prevent any SW registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  }
}