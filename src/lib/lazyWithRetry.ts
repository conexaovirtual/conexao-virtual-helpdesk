import { lazy, type ComponentType } from 'react';

/**
 * Lazy-load a component with automatic retry on chunk load failure.
 * 
 * When a new deploy happens, old chunk URLs become invalid. Browsers with
 * the old index.html cached will fail to import the new chunks, causing
 * "Importing a module script failed" / "Failed to fetch dynamically imported module".
 * 
 * This wrapper detects that error and reloads the page once (using a
 * sessionStorage flag to avoid infinite reload loops).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const reloadKey = 'cv:chunk-reloaded';
    try {
      const mod = await factory();
      // success — clear the flag for future failures
      sessionStorage.removeItem(reloadKey);
      return mod;
    } catch (error: any) {
      const message = String(error?.message || error);
      const isChunkError =
        message.includes('Importing a module script failed') ||
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('error loading dynamically imported module') ||
        error?.name === 'ChunkLoadError';

      if (isChunkError && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        // Clear stale service worker + caches that may be serving old index.html
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch (e) {
          console.warn('Failed to clear SW/caches before reload', e);
        }
        window.location.reload();
        // Return a never-resolving promise so React doesn't try to render
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
