import { useState } from 'react'

// A button that asks once more before doing something you can't undo.
export default function ConfirmButton({ label, question, confirmLabel, onConfirm, busy, className = 'link-button' }) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button type="button" className={className} disabled={busy} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="confirm">
      <span>{question}</span>
      <button type="button" className="button button-small" disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="link-button" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  )
}
