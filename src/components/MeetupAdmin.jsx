import { useCallback, useEffect, useState } from 'react'
import {
  NOTE_MAX,
  PLACE_MAX,
  cancelMeetup,
  editMeetup,
  guestLine,
  isoToBerlinInputs,
  loadAdminMeetups,
  mapsLink,
  meetupFormError,
  meetupShortDate,
  meetupWhen,
  postMeetup,
  splitAdminMeetups,
} from '../lib/meetups'
import ConfirmButton from './ConfirmButton'
import Field from './Field'

const EMPTY = { date: '', time: '19:00', place: '', note: '' }

// On the Account page, for Asad only: post the next book club meet-up, edit
// or cancel it, see who's coming, and how many came to earlier ones.
export default function MeetupAdmin() {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const reload = useCallback(() => loadAdminMeetups().then(setRows).catch((e) => setError(e.message)), [])
  useEffect(() => {
    reload()
  }, [reload])

  const { upcoming, earlier } = splitAdminMeetups(rows ?? [])
  const showForm = rows && (!upcoming || editing)

  async function run(action, message) {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await action()
      await reload()
      setEditing(false)
      setForm(EMPTY)
      setDone(message)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    const problem = meetupFormError(form)
    if (problem) {
      setError(problem)
      return
    }
    if (editing) {
      run(() => editMeetup(upcoming.id, form), 'Saved. If the date, time or place changed, those coming have been told.')
    } else {
      run(() => postMeetup(form), 'Posted. Everyone with notifications on hears about it within a minute.')
    }
  }

  const update = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value })
    setError('')
  }

  return (
    <section className="shelf" aria-labelledby="meetup-admin-title">
      <h2 id="meetup-admin-title" className="shelf-title">Book club meet-up</h2>
      <p className="account-text">Only you see this. Members see the meet-up at the top of the Catalogue.</p>

      {!rows && !error && <p className="shelf-note">Loading meet-ups…</p>}

      {upcoming && !editing && (
        <div className="meetup-admin-next">
          <p className="meetup-when">{meetupWhen(upcoming.starts_at)}</p>
          <p className="meetup-place">
            <a href={mapsLink(upcoming.place)} target="_blank" rel="noreferrer">{upcoming.place}</a>
          </p>
          {upcoming.note && <p className="meetup-note">{upcoming.note}</p>}
          <p className="meetup-guests">{guestLine(upcoming.coming, upcoming.names)}</p>
          <div className="meetup-actions">
            <button type="button" className="button button-quiet" disabled={busy}
              onClick={() => {
                setForm({ ...isoToBerlinInputs(upcoming.starts_at), place: upcoming.place, note: upcoming.note ?? '' })
                setEditing(true)
                setDone('')
              }}>
              Edit
            </button>
            <ConfirmButton label="Cancel meet-up" busy={busy}
              question={upcoming.coming ? `Cancel it? The ${upcoming.coming} coming will be told.` : 'Cancel it?'}
              confirmLabel="Cancel meet-up"
              onConfirm={() => run(() => cancelMeetup(upcoming.id), 'Cancelled. The card is gone from the Catalogue.')} />
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="form meetup-form" noValidate>
          <div className="meetup-form-when">
            <Field label="Date">
              <input type="date" value={form.date} onChange={update('date')} required />
            </Field>
            <Field label="Starts at (Berlin time)">
              <input type="time" value={form.time} onChange={update('time')} required />
            </Field>
          </div>
          <Field label="Place" hint="Members can tap it to open Google Maps.">
            <input value={form.place} maxLength={PLACE_MAX} placeholder="Café Pförtner, Uferstraße 8"
              onChange={update('place')} required />
          </Field>
          <Field label="Note (optional)" hint={`Up to ${NOTE_MAX} characters. The card always says to bring the book you can't put down.`}>
            <textarea value={form.note} maxLength={NOTE_MAX} rows={2} onChange={update('note')} />
          </Field>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busy}>
              {editing ? 'Save changes' : 'Post meet-up'}
            </button>
            {editing && (
              <button type="button" className="link-button" onClick={() => {
                setEditing(false)
                setError('')
              }}>
                Keep it as it was
              </button>
            )}
          </div>
          <p className="field-hint">
            {editing
              ? 'No new announcement. If you move the date, time or place, those coming get a notification.'
              : 'Everyone with notifications on gets one announcement; those coming get a reminder the morning before.'}
          </p>
        </form>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="shelf-note" role="status">{done}</p>}

      {earlier.length > 0 && (
        <div className="meetup-earlier">
          <h3 className="invite-list-label">Earlier meet-ups</h3>
          <ul className="invite-list">
            {earlier.map((m) => (
              <li key={m.id}>
                <span>
                  {meetupShortDate(m.starts_at)}, {m.place}: {guestLine(m.coming, m.names)}
                </span>
              </li>
            ))}
          </ul>
          <p className="field-hint">Names go a week after each meet-up; the number stays.</p>
        </div>
      )}
    </section>
  )
}
