import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Shown once, on a member's first visit: the invite only knows their email.
export default function CompleteProfile({ member, onSaved }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase
      .from('members')
      .update({ name: name.trim(), city: city.trim() })
      .eq('id', member.id)
      .select('id, name, city, role')
      .single()
    if (error) {
      setError(`Your details weren't saved: ${error.message}`)
      setBusy(false)
    } else {
      onSaved(data)
    }
  }

  return (
    <main className="entry">
      <div className="entry-card">
        <h1 className="entry-title">Welcome to the library</h1>
        <p className="entry-lede">
          Before you browse, tell Asad who's borrowing. Only Asad sees your name and city.
        </p>
        <form onSubmit={save} className="form">
          <label>
            Your name
            <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            City
            <input autoComplete="address-level2" required value={city}
              onChange={(e) => setCity(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save and start browsing'}
          </button>
        </form>
      </div>
    </main>
  )
}
