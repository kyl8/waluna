// some image optimazation utilities - lazy loading, blur hash, caching
import { indexedDBCache, STORES } from '../cache/indexedDb.js';

export function generateBlurHash(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hue = Math.abs(hash % 360);
  const saturation = 30 + (Math.abs(hash >> 8) % 30);
  const lightness = 85 + (Math.abs(hash >> 16) % 10);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function optimizeImageUrl(url, thumbnail = true) {
  if (!url) return null;
  if (thumbnail && url.includes('image.tmdb.org')) {
    return url.replace('/original/', '/w154/');
  }

  return url;
}

// preload images
export function preloadImage(src) {
  if (!src) return;

  const img = new Image();
  img.src = src;
  img.loading = 'eager';
}

// prefetch images during idle
export function prefetchImages(urls = []) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      urls.forEach(url => {
        if (url) {
          const img = new Image();
          img.src = url;
        }
      });
    });
  } else {
    setTimeout(() => {
      urls.forEach(url => {
        if (url) {
          const img = new Image();
          img.src = url;
        }
      });
    }, 2000);
  }
}

// cache image url in indexeddb
export async function cacheImageUrl(url) {
  if (!url) return;

  try {
    const cached = await indexedDBCache.get(STORES.IMAGES, url);
    if (cached) return; 
    await indexedDBCache.set(
      STORES.IMAGES,
      url,
      { url, cached: true },
      24 * 60 * 60 * 1000 // 24 hours
    );
  } catch {
    // pass
  }
}

// batch cache helper
export function batchCacheImages(urls = []) {
  urls.forEach(url => cacheImageUrl(url));
}

// srcset helper (noop)
export function getSrcSet(baseUrl) {
  if (!baseUrl) return baseUrl;
  return baseUrl;
}

export default {
  generateBlurHash,
  optimizeImageUrl,
  preloadImage,
  prefetchImages,
  cacheImageUrl,
  batchCacheImages,
  getSrcSet,
};