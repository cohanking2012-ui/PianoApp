/** Registers the service worker (offline support) and reports when an update is waiting. */
let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

export function onUpdateReady(fn: () => void) {
  listeners.add(fn)
  if (waiting) fn()
  return () => {
    listeners.delete(fn)
  }
}

export function applyUpdate() {
  if (!waiting) return window.location.reload()
  waiting.postMessage('skip-waiting')
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' })
      const track = (worker: ServiceWorker | null) => {
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = worker
            listeners.forEach((fn) => fn())
          }
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting
        listeners.forEach((fn) => fn())
      }
      reg.addEventListener('updatefound', () => track(reg.installing))
      // Reload once a new version takes over (but not on the very first install).
      const hadController = !!navigator.serviceWorker.controller
      let reloaded = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return
        reloaded = true
        window.location.reload()
      })
      // Check for a new version when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    } catch {
      /* offline support is optional */
    }
  })
}
