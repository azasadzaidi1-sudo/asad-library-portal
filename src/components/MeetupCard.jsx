import { useCallback, useEffect, useState } from 'react'
import {
  FORMAT_LINE,
  MEETUP_TITLE,
  cantMakeIt,
  comingLine,
  countMeIn,
  hideMeetupNudge,
  loadMeetupCard,
  mapsLink,
  meetupWhen,
} from '../lib/meetups'

// The top of the Catalogue, for everyone:
//   * while a meet-up is coming up (until the end of its day): when, where,
//     the format, Asad's note, how many are coming, and "Count me in"
//   * for a week after one you said you'd come to: "Presented a book? Add
//     it to your shelf", until you close it or add a book
// Shows nothing at all otherwise, or if it can't load (the catalogue matters more).
export default function MeetupCard({ isLibrarian }) {
  const [card, setCard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(
    () => loadMeetupCard().then(setCard).catch((e) => console.warn('The meet-up card could not load:', e.message)),
    [],
  )
  useEffect(() => {
    reload()
  }, [reload])

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!card || (!card.meetup_id && !card.nudge_meetup_id)) return null

  return (
    <>
      {card.meetup_id && (
        <section className="meetup" aria-labelledby="meetup-title">
          <h2 id="meetup-title" className="meetup-title">{MEETUP_TITLE}</h2>
          <p className="meetup-when">{meetupWhen(card.starts_at)}</p>
          <p className="meetup-place">
            <a href={mapsLink(card.place)} target="_blank" rel="noreferrer">{card.place}</a>
          </p>
          <p className="meetup-format">{FORMAT_LINE}</p>
          {card.note && <p className="meetup-note">{card.note}</p>}
          <div className="meetup-actions">
            {card.i_am_coming ? (
              <>
                <span className="meetup-in">You're in</span>
                <button type="button" className="link-button" disabled={busy}
                  onClick={() => run(() => cantMakeIt(card.meetup_id))}>
                  Can't make it after all
                </button>
              </>
            ) : (
              <button type="button" className="button" disabled={busy}
                onClick={() => run(() => countMeIn(card.meetup_id))}>
                Count me in
              </button>
            )}
            <span className="meetup-count">{comingLine(card.coming)}</span>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      )}

      {card.nudge_meetup_id && (
        <section className="meetup meetup-nudge" aria-label="After the meet-up">
          <p>Presented a book at the meet-up? Add it to your shelf so others can borrow it.</p>
          <div className="meetup-actions">
            <a className="button button-quiet" href="#add-book">
              {isLibrarian ? 'Add it to your shelf' : 'Start your shelf with it'}
            </a>
            <button type="button" className="link-button" disabled={busy}
              onClick={() => run(() => hideMeetupNudge(card.nudge_meetup_id))}>
              Hide this
            </button>
          </div>
        </section>
      )}
    </>
  )
}
