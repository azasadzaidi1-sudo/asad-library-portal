import { useState } from 'react'
import { describeShelf } from '../lib/library'
import { SHELF_LINE_MAX } from '../lib/shelves'
import Field from './Field'

// Two lines a librarian writes about their shelf (not about themselves):
// its personality, and when and where pick-ups usually happen. Used after
// a new librarian's first book, and on their own card on the Libraries page.
export default function DescribeShelf({ shelf, title, intro, cancelLabel = 'Cancel', onCancel, onSaved }) {
  const [personality, setPersonality] = useState(shelf?.personality ?? '')
  const [pickups, setPickups] = useState(shelf?.pickups ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    if (!personality.trim() && !pickups.trim()) {
      setError(onCancel ? `Write at least one line, or choose ${cancelLabel}.` : 'Write at least one line.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await describeShelf(personality, pickups)
      await onSaved()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <form className="describe-shelf" onSubmit={save} noValidate>
      {title && <h3 className="describe-shelf-title">{title}</h3>}
      {intro && <p>{intro}</p>}
      <Field label="Your shelf personality in one line">
        <input value={personality} maxLength={SHELF_LINE_MAX} placeholder="Thrillers and far too much poetry"
          onChange={(e) => setPersonality(e.target.value)} />
      </Field>
      <Field label="Pick-ups: Usually preferred time and place?"
        hint="Only borrowers you've approved see this line.">
        <input value={pickups} maxLength={SHELF_LINE_MAX} placeholder="Weekday evenings, near Hermannplatz"
          onChange={(e) => setPickups(e.target.value)} />
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        {onCancel && (
          <button type="button" className="button button-quiet" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  )
}
