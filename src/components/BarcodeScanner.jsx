import { useEffect, useRef, useState } from 'react'
import { isbnFrom } from '../lib/openLibrary'

// Chrome on Android can read barcodes itself (the BarcodeDetector API), so
// no extra library is needed. Elsewhere the scan button simply isn't shown.
export function canScanBarcodes() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia)
}

// Opens the back camera and calls onIsbn with the first book barcode it sees.
export default function BarcodeScanner({ onIsbn, onClose }) {
  const video = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream
    let timer
    let stopped = false

    async function start() {
      try {
        const detector = new window.BarcodeDetector({ formats: ['ean_13'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return
        video.current.srcObject = stream
        await video.current.play()
        timer = setInterval(async () => {
          try {
            const codes = await detector.detect(video.current)
            const isbn = codes.map((c) => isbnFrom(c.rawValue)).find(Boolean)
            if (isbn) {
              clearInterval(timer)
              onIsbn(isbn)
            }
          } catch {
            // The next frame will try again.
          }
        }, 300)
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'The camera is blocked. Allow camera access for this site, or type the title instead.'
            : "The camera couldn't start. Type the title or ISBN instead.",
        )
      }
    }

    start()
    return () => {
      stopped = true
      clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onIsbn])

  return (
    <div className="scanner">
      {error ? (
        <p className="form-error" role="alert">{error}</p>
      ) : (
        <>
          <video ref={video} className="scanner-video" muted playsInline aria-label="Camera view" />
          <p className="scanner-hint">Point the camera at the barcode on the back of the book.</p>
        </>
      )}
      <button type="button" className="link-button" onClick={onClose}>
        Stop scanning
      </button>
    </div>
  )
}
