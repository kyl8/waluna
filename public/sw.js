/**
 * Service Worker for aggressive caching strategy
 * - Cache first for static assets
 * - Stale-while-revalidate for API responses
 * - Network first for critical data
 */

const CACHE_NAME = 'waluna-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const API_CACHE_NAME = 'waluna-api-v1';
const IMAGE_CACHE_NAME = 'waluna-images-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== API_CACHE_NAME && name !== IMAGE_CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests - stale-while-revalidate
  if (url.pathname.includes('/api/') || url.hostname.includes('api.')) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          const fetchPromise = fetch(request).then(networkResponse => {
            // Only cache valid responses
            try {
              if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                const clonedResponse = networkResponse.clone();
                const cacheName = request.url.includes('image') ? IMAGE_CACHE_NAME : API_CACHE_NAME;
                caches.open(cacheName).then(cache => {
                  cache.put(request, clonedResponse).catch(() => {
                    // Silently fail cache write
                  });
                }).catch(() => {
                  // Silently fail cache open
                });
              }
            } catch {
              // Silently fail on any error
            }
            return networkResponse;
          }).catch(() => {
            // Network error - return cached or offline response
            return cachedResponse || new Response('Offline', { status: 503 });
          });

          // Return cached response immediately, or fetch if no cache
          return cachedResponse || fetchPromise;
        })
        .catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Image requests - cache first with background update
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME)
        .then(cache => {
          return cache.match(request)
            .then(response => {
              if (response) {
                // Background fetch for update
                fetch(request).then(networkResponse => {
                  try {
                    if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                      cache.put(request, networkResponse.clone()).catch(() => {
                        // Silently fail cache write
                      });
                    }
                  } catch {
                    // Silently fail
                  }
                }).catch(() => {
                  // Silently fail background update
                });
                return response;
              }

              return fetch(request)
                .then(networkResponse => {
                  try {
                    if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                      cache.put(request, networkResponse.clone()).catch(() => {
                        // Silently fail cache write
                      });
                    }
                  } catch {
                    // Silently fail
                  }
                  return networkResponse;
                })
                .catch(() => new Response(null, { status: 404 }));
            });
        })
        .catch(() => new Response(null, { status: 404 }))
    );
    return;
  }

  // Static assets - cache first
  if (request.method === 'GET') {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then(cache => {
          return cache.match(request)
            .then(response => {
              if (response) {
                return response;
              }
              return fetch(request)
                .then(networkResponse => {
                  try {
                    if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                      cache.put(request, networkResponse.clone()).catch(() => {
                        // Silently fail cache write
                      });
                    }
                  } catch {
                    // Silently fail
                  }
                  return networkResponse;
                })
                .catch(() => new Response('Offline', { status: 503 }));
            });
        })
        .catch(() => new Response('Offline', { status: 503 }))
    );
  }
});
