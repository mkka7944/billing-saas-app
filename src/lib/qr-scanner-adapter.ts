'use client'

import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import QrScanner from 'qr-scanner'

export interface QrScannerAdapter {
  readonly id: string
  start(): Promise<void>
  stop(): Promise<void>
}

export function createScanner(id: string, containerEl: HTMLElement, onDecode: (text: string) => void, onError: (err: string) => void): QrScannerAdapter {
  if (id === 'nimiq') return new NimiqAdapter(containerEl, onDecode, onError)
  return new Html5Adapter(containerEl, onDecode, onError)
}

class Html5Adapter implements QrScannerAdapter {
  readonly id = 'html5'
  private scanner: Html5Qrcode | null = null
  private onDecode: (text: string) => void
  private onError: (err: string) => void
  private containerId: string

  constructor(containerEl: HTMLElement, onDecode: (text: string) => void, onError: (err: string) => void) {
    this.containerId = containerEl.id || 'qr-reader-html5'
    containerEl.id = this.containerId
    this.onDecode = onDecode
    this.onError = onError
  }

  async start(): Promise<void> {
    const scanner = new Html5Qrcode(this.containerId)
    this.scanner = scanner

    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 20,
        qrbox: (vw: number, vh: number) => {
          const size = Math.floor(Math.min(vw, vh) * 0.7)
          return { width: size, height: size }
        },
        aspectRatio: 1.777778,
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      } as any,
      (decodedText) => { this.onDecode(decodedText) },
      () => {}
    )
  }

  async stop(): Promise<void> {
    if (this.scanner) {
      try {
        await this.scanner.stop()
        await this.scanner.clear()
      } catch {}
      this.scanner = null
    }
  }
}

class NimiqAdapter implements QrScannerAdapter {
  readonly id = 'nimiq'
  private scanner: QrScanner | null = null
  private onDecode: (text: string) => void
  private onError: (err: string) => void
  private containerEl: HTMLElement
  private videoEl: HTMLVideoElement | null = null

  constructor(containerEl: HTMLElement, onDecode: (text: string) => void, onError: (err: string) => void) {
    this.containerEl = containerEl
    this.onDecode = onDecode
    this.onError = onError
  }

  async start(): Promise<void> {
    const video = document.createElement('video')
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    this.containerEl.appendChild(video)
    this.videoEl = video

    const scanner = new QrScanner(
      video,
      (result) => { this.onDecode(result.data) },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 10,
        preferredCamera: 'environment',
      },
    )
    this.scanner = scanner
    await scanner.start()
  }

  async stop(): Promise<void> {
    if (this.scanner) {
      this.scanner.stop()
      this.scanner.destroy()
      this.scanner = null
    }
    if (this.videoEl && this.videoEl.parentNode) {
      this.videoEl.parentNode.removeChild(this.videoEl)
    }
    this.videoEl = null
  }
}
