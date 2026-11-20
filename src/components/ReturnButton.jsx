import { useState } from 'react'

// Two clicks to record a return, so a slip of the finger doesn't end a loan.
export default function ReturnButton({ onReturn, busy }) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => setAsking(true)}>
        Mark returned
      </button>
    )
  }
  return (
    <span className="confirm">
      <span>Returned today?</span>
      <button type="button" className="button" disabled={busy} onClick={onReturn}>
        Yes, returned
      </button>
      <button type="button" className="link-button" onClick={() => setAsking(false)}>
        Not yet
      </button>
    </span>
  )
}
