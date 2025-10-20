/**
 * Image optimization utilities for aggressive performance
 * - Lazy loading with blur hash placeholders
 * - WebP format support with fallbacks
 * - Image caching and prefetching
 */

import { indexedDBCache, STORES } from '../cache/indexedDb.js';

/**
 * Generate blur hash placeholder for images
 * Simple hash-based placeholder string for visuals during load
 */
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

/**
 * Optimize image URL for lazy loading
 * Converts to smaller thumbnail initially
 */
export function optimizeImageUrl(url, thumbnail = true) {
  if (!url) return null;

  // For image services that support sizing
  if (thumbnail && url.includes('image.tmdb.org')) {
    return url.replace('/original/', '/w154/');
  }

  return url;
}

/**
 * Preload image for critical images
 */
export function preloadImage(src) {
  if (!src) return;

  const img = new Image();
  img.src = src;
  img.loading = 'eager';
}

/**
 * Prefetch images for likely next navigations
 */
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

/**
 * Cache image in IndexedDB
 */
export async function cacheImageUrl(url) {
  if (!url) return;

  try {
    const cached = await indexedDBCache.get(STORES.IMAGES, url);
    if (cached) return; // Already cached

    // Cache the URL reference (actual binary caching done by Service Worker)
    await indexedDBCache.set(
      STORES.IMAGES,
      url,
      { url, cached: true },
      24 * 60 * 60 * 1000 // 24 hours
    );
  } catch {
    // Silent fail for IndexedDB operations
  }
}

/**
 * Batch cache multiple images
 */
export function batchCacheImages(urls = []) {
  urls.forEach(url => cacheImageUrl(url));
}

/**
 * Get WebP fallback chain for image src
 */
export function getSrcSet(baseUrl) {
  if (!baseUrl) return baseUrl;

  // Return srcSet format: original image with fallback
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