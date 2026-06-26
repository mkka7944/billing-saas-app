'use client'

import { useEffect, useState, useCallback } from 'react'

export function PwaRegister() {
  const [installable, setInstallable] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  const promptUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING')
    }
  }, [waitingWorker])

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return

    const regPromise = navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    regPromise.then((reg) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting)
        setUpdateAvailable(true)
      }

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newSW)
            setUpdateAvailable(true)
          }
        })
      })
    })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })

    const beforeInstallHandler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', beforeInstallHandler)

    window.addEventListener('appinstalled', () => {
      setInstallable(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') setInstallable(false)
    setDeferredPrompt(null)
  }

  return (
    <>
      {installable && (
        <button
          onClick={handleInstall}
          className="fixed bottom-4 right-4 z-[9999] bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm font-semibold animate-in fade-in slide-in-from-bottom-2"
        >
          Install App
        </button>
      )}
    </>
  )
}

export function useSWUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then((reg) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting)
        setUpdateAvailable(true)
      }

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newSW)
            setUpdateAvailable(true)
          }
        })
      })
    })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING')
    }
  }, [waitingWorker])

  const checkForUpdates = useCallback(async () => {
    if (process.env.NODE_ENV === 'development') return false
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false

    // Wait for updatefound event or timeout
    const result = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 10000)

      if (reg.waiting) {
        clearTimeout(timeout)
        setWaitingWorker(reg.waiting)
        setUpdateAvailable(true)
        resolve(true)
        return
      }

      const onUpdateFound = () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed') {
            clearTimeout(timeout)
            setWaitingWorker(newSW)
            setUpdateAvailable(true)
            resolve(true)
          }
        })
      }

      reg.addEventListener('updatefound', onUpdateFound)
      reg.update()
    })

    return result
  }, [])

  return { updateAvailable, applyUpdate, checkForUpdates }
}
