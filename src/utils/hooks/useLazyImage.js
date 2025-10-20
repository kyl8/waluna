// lazy image loading and caching
import { useEffect, useState, useCallback, useRef } from 'react';
import { generateBlurHash, cacheImageUrl } from '../image/optimization.js';
import { indexedDBCache, STORES } from '../cache/indexedDb';

export function useLazyImage(imageSrc, options = {}) {
  const [src, setSrc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  const blurHash = generateBlurHash(imageSrc || '');
  const { 
    threshold = 0.1, 
    rootMargin = '50px',
    enableIndexedDB = true,
    enablePreload = false 
  } = options;

  // try to load from IndexedDB cache first
  const loadFromCache = useCallback(async () => {
    if (!enableIndexedDB || !imageSrc) return null;

    try {
      const cached = await indexedDBCache.get(STORES.IMAGES, imageSrc);
      if (cached) {
        // dependendo do shape salvo, cached pode conter o próprio item
        setSrc(imageSrc);
        setLoaded(true);
        return true;
      }
    } catch {
      // pass
    }
    return false;
  }, [imageSrc, enableIndexedDB]);

  // observer setup
  useEffect(() => {
    if (enablePreload && imageSrc) {
      // Preload mode - load immediately
      loadFromCache().then(wasCached => {
        if (!wasCached) {
          setSrc(imageSrc);
        }
      });
      return;
    }

    if (!imageSrc || !imgRef.current) return;

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadFromCache().then(wasCached => {
            if (!wasCached) {
              setSrc(imageSrc);
              // Cache in IndexedDB
              if (enableIndexedDB) {
                cacheImageUrl(imageSrc);
              }
            }
          });

          if (observerRef.current) {
            observerRef.current.unobserve(entry.target);
          }
        }
      });
    };

    try {
      observerRef.current = new IntersectionObserver(observerCallback, {
        threshold,
        rootMargin,
      });

      observerRef.current.observe(imgRef.current);
    } catch {
      setSrc(imageSrc);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [imageSrc, threshold, rootMargin, enableIndexedDB, enablePreload, loadFromCache]);

  return {
    ref: imgRef,
    src,
    loaded,
    blurHash,
    loading: !loaded && src === imageSrc,
  };
}

export default useLazyImage;
