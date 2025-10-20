// registra o service worker apenas em produção
if (import.meta.env.PROD) {
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
  // em desenvolvimento, previne o uso de service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  }
}