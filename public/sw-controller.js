// Run IMMEDIATELY before app loads to prevent SW from intercepting HMR
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      reg.unregister().catch((err) => console.log('SW unregister error:', err));
    });
  });
}
