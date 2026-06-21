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

/** Find the standard rear lens (camera2 0) on Samsung multi-camera phones */
async function findStandardCamera(): Promise<string | null> {
  try {
    const cameras = await Html5Qrcode.getCameras()
    const standard = cameras.find(c => c.label.startsWith('camera2 0'))
    return standard?.id ?? null
  } catch {
    return null
  }
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

    const cameraId = await findStandardCamera()
    const cameraConfig = cameraId ?? { facingMode: 'environment' }

    await scanner.start(
      cameraConfig as any,
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
    // Force JS QR engine — Samsung Chrome's native BarcodeDetector silently fails
    ;(QrScanner as any)._disableBarcodeDetector = true

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

    // Samsung multi-lens fix: switch to standard lens (camera2 0)
    try {
      const cameras = await QrScanner.listCameras(true)
      const standard = cameras.find(c => c.label.startsWith('camera2 0'))
      if (standard) {
        const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]
        const currentId = track?.getSettings().deviceId
        if (currentId !== standard.id) {
          await scanner.setCamera(standard.id)
        }
      }
    } catch {}
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
