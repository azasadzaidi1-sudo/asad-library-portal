import { useEffect, useRef, useState } from 'react'
import PrivacyNotice from './PrivacyNotice'
import HouseRules from './HouseRules'

const TITLES = { privacy: 'Privacy notice', rules: 'House rules' }

// The privacy notice or the house rules in a pop-up, for screens outside the
// app itself (the Join page, and accepting the rules). Neither has its own
// web address there, so nobody without an invitation or an account sees
// the contact details.
export default function LegalDialog({ initial, contact, onClose }) {
  const dialogRef = useRef(null)
  const [showing, setShowing] = useState(initial)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const close = () => dialogRef.current?.close()

  // Inside the pop-up, the two texts link to each other; the Account page
  // isn't open to someone who hasn't joined yet, so it stays plain text.
  const linkTo = (page, label) =>
    TITLES[page] ? (
      <button type="button" className="link-button" onClick={() => setShowing(page)}>{label}</button>
    ) : (
      label
    )

  return (
    <dialog
      ref={dialogRef}
      className="book-dialog legal-dialog"
      aria-labelledby="legal-dialog-title"
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <div className="dialog-inner">
        <button type="button" className="link-button dialog-close" onClick={close}>
          Close
        </button>
        <h2 id="legal-dialog-title" className="dialog-title">{TITLES[showing]}</h2>
        {showing === 'privacy'
          ? <PrivacyNotice contact={contact} linkTo={linkTo} />
          : <HouseRules contact={contact} linkTo={linkTo} />}
      </div>
    </dialog>
  )
}
