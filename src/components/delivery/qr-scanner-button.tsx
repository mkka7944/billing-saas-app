'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { QrCode, X, Loader2, Scan } from 'lucide-react'
import type { AssignmentItemWithUnit } from '@/types'

interface QRScannerButtonProps {
  items: AssignmentItemWithUnit[]
  onUnitScanned: (psid: string) => void
}

export default function QRScannerButton({ items, onUnitScanned }: QRScannerButtonProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopScanner()
    }
  }, [])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        await scannerRef.current.clear()
      } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }, [])

  const startScanner = useCallback(async () => {
    setError(null)
    setScanning(true)

    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const match = decodedText.match(/sid=([A-Za-z0-9_-]+)/)
          if (!match) {
            setError('No survey ID (sid=) found in QR code')
            return
          }
          const surveyId = match[1]
          const matched = items.find((i) => i.survey_id === surveyId)
          if (!matched) {
            setError(`No assignment matches survey ID: ${surveyId}`)
            return
          }
          if (mountedRef.current) {
            stopScanner()
            setOpen(false)
            setError(null)
            onUnitScanned(matched.psid)
          }
        },
        () => {}
      )
    } catch (e) {
      if (mountedRef.current) {
        setError(`Camera error: ${(e as Error).message}`)
        setScanning(false)
      }
    }
  }, [items, onUnitScanned, stopScanner])

  const handleClose = useCallback(() => {
    stopScanner()
    setOpen(false)
    setError(null)
    setManualInput('')
  }, [stopScanner])

  const handleManualSubmit = useCallback(() => {
    const sid = manualInput.trim()
    if (!sid) return
    const matched = items.find((i) => i.survey_id === sid)
    if (!matched) {
      setError(`No assignment matches survey ID: ${sid}`)
      return
    }
    handleClose()
    onUnitScanned(matched.psid)
  }, [manualInput, items, onUnitScanned, handleClose])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[1000] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px]"
        aria-label="Scan QR code"
      >
        <QrCode className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
            <span className="text-sm font-semibold">Scan Bill QR Code</span>
            <button onClick={handleClose} className="p-2 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-4">
            {!scanning && !error && (
              <div className="text-center space-y-4">
                <div className="w-24 h-24 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
                  <Scan className="h-10 w-10 text-white/60" />
                </div>
                <p className="text-sm text-white/60 max-w-xs">
                  Point your camera at the QR code on the physical bill
                </p>
                <button
                  onClick={startScanner}
                  className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold cursor-pointer min-h-[44px]"
                >
                  Start Camera
                </button>
              </div>
            )}

            <div id="qr-reader" className={`${scanning && !error ? '' : 'hidden'} w-full max-w-sm`} />
          </div>

          {scanning && (
            <div className="shrink-0 pb-4 flex items-center justify-center gap-2 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Scanning...</span>
            </div>
          )}

          {error && (
            <div className="shrink-0 px-4 pb-4 space-y-3">
              <p className="text-sm text-red-400 text-center">{error}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-pointer min-h-[44px]"
                >
                  Retry
                </button>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Manual survey ID"
                  className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm placeholder-white/40 border border-white/20 min-w-0 max-w-32"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleManualSubmit()
                  }}
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualInput.trim()}
                  className="px-3 py-2 bg-white/20 text-white rounded-lg text-sm font-semibold cursor-pointer min-h-[44px] disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
